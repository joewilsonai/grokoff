// GrokOff: Stop retains an honest unfinished-tool receipt across server restart.
// Real owned HTTP/server/Claude adapter; scripted CLI only, no native browser or account.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import type { WireBot, WireMessage } from "../shared/wire.ts";
import { launchVerificationServer, verificationServerEnvironment } from "../scripts/control-omb.ts";
import { waitForExit } from "./testing/cleanup.ts";

type BotSnapshot = WireBot & { messages: WireMessage[] };
const root = fileURLToPath(new URL("..", import.meta.url));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

it.skipIf(process.platform === "win32")("settles a stopped browser tool as interrupted, preserves actual outcomes, and reloads the same receipt", async () => {
  const fixture = await launchVerificationServer({ FAKE_CLAUDE_MODE: "hang" });
  let restarted: ChildProcess | undefined;
  let providerPid: number | undefined;
  const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json", origin: fixture.info.url },
      signal: AbortSignal.timeout(10_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
    return await response.json() as T;
  };
  try {
    const pidFile = join(fixture.info.dataDir, "owned-provider.pid");
    const wrapper = join(fixture.info.dataDir, "pending-tool-claude.mjs");
    const frames = [
      { type: "assistant", message: { content: [{ type: "tool_use", id: "finished", name: "Read", input: { file: "synthetic.md" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "finished", is_error: false, content: "Recorded synthetic result" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "failed", name: "Read", input: { file: "missing.md" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "failed", is_error: true, content: "Recorded synthetic refusal" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "pending", name: "mcp__browser__get_text", input: { selector: "main" } }] } },
    ];
    writeFileSync(wrapper, [
      "#!/usr/bin/env node", "import { writeFileSync } from 'node:fs';",
      "process.env.FAKE_CLAUDE_MODE = 'hang';", "const original = process.stdout.write.bind(process.stdout); let injected = false;",
      `const frames = ${JSON.stringify(frames)};`,
      `process.stdout.write = (chunk, ...rest) => { const result = original(chunk, ...rest); try { const event = JSON.parse(String(chunk)); if (event.type === 'system' && event.subtype === 'init' && !injected) { injected = true; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); for (const frame of frames) original(JSON.stringify(frame) + '\\n'); } } catch {} return result; };`,
      `await import(${JSON.stringify(pathToFileURL(join(root, "server/testing/fake-claude-cli.ts")).href)});`,
    ].join("\n"), { mode: 0o700 });
    await api("PATCH", "/api/instances/claude", { cli: wrapper });
    await api("PATCH", "/api/config", { features: { showToolCalls: true, llmThreadTitles: false, autoRecall: false } });
    const bot = (await api<{ bots: BotSnapshot[] }>("GET", "/api/bots?messages=200")).bots[0]!;
    const snapshot = async () => (await api<{ bots: BotSnapshot[] }>("GET", "/api/bots?messages=200")).bots.find(item => item.id === bot.id)!;
    await api("POST", `/api/bots/${bot.id}/messages`, { threadId: bot.threadId, text: "Use only the synthetic research tool." });
    await expect.poll(async () => (await snapshot()).messages.some(message => message.tool?.itemId === "pending"), { timeout: 10_000 }).toBe(true);
    const before = await snapshot();
    expect(before.busy).toBe(true);
    providerPid = Number(readFileSync(pidFile, "utf8"));
    expect(alive(providerPid)).toBe(true);
    const finished = before.messages.filter(message => message.tool?.ok !== undefined);
    await api("POST", `/api/bots/${bot.id}/interrupt`, { threadId: bot.threadId });
    await expect.poll(async () => !(await snapshot()).busy && !alive(providerPid!), { timeout: 10_000 }).toBe(true);
    const after = await snapshot();
    const interrupted = after.messages.find(message => message.tool?.itemId === "pending")!;
    expect(after.activity).toBe("idle");
    expect(interrupted.tool).toMatchObject({ name: "mcp__browser__get_text", interrupted: true });
    expect(interrupted.tool).not.toHaveProperty("ok");
    expect(interrupted.tool).not.toHaveProperty("output");
    expect(after.messages.filter(message => message.tool?.ok !== undefined)).toEqual(finished);
    expect(finished.some(message => message.tool?.ok === true && message.tool.output?.includes("Recorded synthetic result"))).toBe(true);
    expect(finished.some(message => message.tool?.ok === false && message.tool.output?.includes("Recorded synthetic refusal"))).toBe(true);

    await waitForExit(fixture.child, { signal: "SIGTERM" });
    expect(alive(fixture.info.pid)).toBe(false);
    const port = Number(new URL(fixture.info.url).port);
    restarted = spawn(process.execPath, ["--experimental-strip-types", join(root, "server/index.ts")], {
      cwd: root, env: verificationServerEnvironment({ FAKE_CLAUDE_MODE: "hang" }, fixture.info.dataDir, port), stdio: "ignore",
    });
    await expect.poll(async () => {
      try { return (await fetch(`${fixture.info.url}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; }
      catch { return false; }
    }, { timeout: 15_000 }).toBe(true);
    const restored = await snapshot();
    expect(restored.messages.find(message => message.id === interrupted.id)).toEqual(interrupted);
    expect(restored.messages.filter(message => message.tool?.ok !== undefined)).toEqual(finished);
    expect(restored.busy).toBe(false);
  } finally {
    await waitForExit(restarted, { signal: "SIGTERM" });
    await fixture.close();
    expect(alive(fixture.info.pid)).toBe(false);
    if (restarted?.pid) expect(alive(restarted.pid)).toBe(false);
    if (providerPid) expect(alive(providerPid)).toBe(false);
    expect(existsSync(fixture.info.dataDir)).toBe(false);
  }
}, 45_000);
