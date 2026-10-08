// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
// Let Codex resolve its effective account, including keyring credentials.
// Reading auth.json directly can label an API-key or keyring login with an
// old file's email. Only the protocol's authentication mode and vetted display
// email leave this helper.
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { userHome } from "../env-path.ts";
import { killCliTree, spawnCli } from "../procs.ts";

const MAX_OUTPUT = 16_384;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CodexAccountState =
  | { method: "chatgpt"; email?: string }
  | { method: "api-key" | "signed-out" | "unknown" };

/** Keep only the protocol's authentication mode and a vetted display email.
 * Missing/unsupported metadata never establishes subscription authority. */
export function codexAccountState(value: unknown): CodexAccountState {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "account")) return { method: "unknown" };
  const account = (value as { account: unknown }).account;
  if (account === null) return { method: "signed-out" };
  if (!account || typeof account !== "object" || Array.isArray(account)) return { method: "unknown" };
  const { type, email } = account as { type?: unknown; email?: unknown };
  if (type === "apiKey") return { method: "api-key" };
  if (type !== "chatgpt") return { method: "unknown" };
  return { method: "chatgpt", ...(typeof email === "string" && email.length <= 254 && EMAIL.test(email) && !/[\p{Cc}\p{Cf}]/u.test(email) ? { email } : {}) };
}

/** Where this environment's Codex keeps its credentials, or null when the
 * configured home is not absolute (the login controller refuses those too). */
export function codexHome(env: Record<string, string | undefined>): string | null {
  if (env.CODEX_HOME) return isAbsolute(env.CODEX_HOME) ? resolve(env.CODEX_HOME) : null;
  const home = userHome(env);
  return isAbsolute(home) ? join(home, ".codex") : null;
}

/** Read-only account metadata. Unsupported CLIs and uncertain responses stay
 * unknown; never fall back to a potentially inactive credential file. */
export async function readCodexAccount(
  cli: string,
  env: Record<string, string | undefined>,
  timeoutMs = 3_000,
): Promise<CodexAccountState> {
  const cwd = env.HOME || env.USERPROFILE || homedir();
  if (!isAbsolute(cwd) || !codexHome(env)) return { method: "unknown" };
  return new Promise((resolveEmail) => {
    let child: ReturnType<typeof spawnCli>;
    try {
      child = spawnCli(cli, ["app-server"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolveEmail({ method: "unknown" });
      return;
    }
    let finishing = false;
    let buffer = "";
    let outputBytes = 0;
    let initialized = false;
    const finish = async (account: CodexAccountState) => {
      if (finishing) return;
      finishing = true;
      clearTimeout(timer);
      let stopped = await killCliTree(child, 1_000);
      if (!stopped && child.pid) {
        try {
          if (process.platform === "win32") child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
        } catch {
          try { child.kill("SIGKILL"); } catch { /* already gone */ }
        }
        stopped = await killCliTree(child, 1_000);
      }
      resolveEmail(stopped ? account : { method: "unknown" });
    };
    const timer = setTimeout(() => { void finish({ method: "unknown" }); }, timeoutMs);
    timer.unref();
    const send = (message: unknown) => {
      try { child.stdin.write(`${JSON.stringify(message)}\n`); } catch { void finish({ method: "unknown" }); }
    };
    child.stdin.on("error", () => { void finish({ method: "unknown" }); });
    child.stderr.resume(); // Do not retain or log raw CLI errors or credentials.
    child.on("error", () => { void finish({ method: "unknown" }); });
    child.on("close", () => { void finish({ method: "unknown" }); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (finishing) return;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT) { void finish({ method: "unknown" }); return; }
      buffer += chunk;
      let newline: number;
      while (!finishing && (newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let message: any;
        try { message = JSON.parse(line); } catch { void finish({ method: "unknown" }); return; }
        if (!initialized && message?.id === 1) {
          if (message.error || !message.result) { void finish({ method: "unknown" }); return; }
          initialized = true;
          send({ method: "initialized", params: {} });
          send({ id: 2, method: "account/read", params: { refreshToken: false } });
        } else if (initialized && message?.id === 2) {
          void finish(message.error ? { method: "unknown" } : codexAccountState(message.result));
        }
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "openmausbot", version: "1" } } });
  });
}

export async function codexAccountEmail(cli: string, env: Record<string, string | undefined>, timeoutMs = 3_000): Promise<string | null> {
  const account = await readCodexAccount(cli, env, timeoutMs);
  return account.method === "chatgpt" ? account.email ?? null : null;
}
