// GrokOff: synthetic saved-login restoration through the pinned native browser.
// All cookies, encryption keys, homes, sockets and child processes belong to this fixture.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { verifyBrowserBundle } from "./prepare-browser.mjs";
import { browserBundlePaths } from "../server/browser-bundle-release.ts";
import { boundBrowserWorkerStreamDrain } from "./testing/browser-worker-streams.mjs";

type Phase = "initial" | "restored" | "guest" | "cleanup";
type FixtureConfig = {
  home: string; dataDir: string; output: string; origin: string;
  binaryPath: string; executablePath: string; session: string; guest: string;
  marker: string; storageMarker: string; env: Record<string, string>;
};
const script = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const { values } = parseArgs({ options: {
  bundle: { type: "string" }, fixture: { type: "string" }, phase: { type: "string" },
  help: { type: "boolean", default: false },
} });
if (values.help) {
  console.log("Usage: node --experimental-strip-types scripts/verify-browser-login.ts --bundle /absolute/verified/browser/bundle");
} else if (values.phase || values.fixture) {
  assert(values.fixture && isAbsolute(values.fixture), "A worker requires an absolute fixture configuration.");
  assert(["initial", "restored", "guest", "cleanup"].includes(values.phase ?? ""), "Invalid fixture phase.");
  await worker(JSON.parse(readFileSync(values.fixture, "utf8")) as FixtureConfig, values.phase as Phase);
} else {
  assert(values.bundle && isAbsolute(values.bundle), "Pass --bundle pointing at a prepared native browser bundle.");
  await verify(resolve(values.bundle));
}

async function worker(config: FixtureConfig, phase: Phase): Promise<void> {
  // Isolate source-module initialization too. Never read a provider/keychain or
  // import the operator's browser configuration, CDP attachment or account env.
  process.env = config.env;
  const { agentBrowserIntegration, browserEngineEncryptionKey, browserRestoreKey,
    closeBrowserSession, prepareBrowserSessionState } = await import("../server/browser-engine.ts");
  const { BrowserRuntime } = await import("../server/browser-runtime.ts");
  const key = browserEngineEncryptionKey(config.dataDir);
  const integration = (session: string, persistent: boolean) => agentBrowserIntegration({
    binaryPath: config.binaryPath, session, encryptionKey: key, persistent, env: config.env,
  });
  const activeSession = phase === "guest" ? config.guest : config.session;
  const spec = integration(activeSession, phase !== "guest");
  const nativePidFile = (session: string) => join(config.env.AGENT_BROWSER_SOCKET_DIR!,
    "namespaces", config.env.AGENT_BROWSER_NAMESPACE!, "run", `${session}.pid`);
  const runtime = new BrowserRuntime({ requestTimeoutMs: 15_000 });
  const proof: Record<string, unknown> = { workerPid: process.pid, phase, session: activeSession };
  let daemonPid: number | undefined;
  let failure: unknown;
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await runtime.agentRpc(activeSession, spec, "tools/call", {
      name: `agent_browser_${name}`, arguments: args,
    }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    assert(!result.isError, `Native ${name} failed: ${JSON.stringify(result).slice(0, 4000)}`);
    return (result.content ?? []).filter(part => part.type === "text").map(part => part.text ?? "").join("\n");
  };
  const closeExact = async (session: string) => {
    const owned = integration(session, session !== config.guest);
    let existingPid: number | undefined;
    try {
      const raw = readFileSync(nativePidFile(session), "utf8").trim();
      assert(/^[1-9][0-9]*$/.test(raw), "Invalid owned native daemon PID during cleanup.");
      existingPid = Number(raw);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    assert(await closeBrowserSession(owned.command, owned.env), `Owned session ${session} did not confirm native shutdown.`);
    if (existingPid) await waitForPidExit(existingPid);
  };
  try {
    if (phase === "cleanup") {
      // Launch-free native close also checks that the exact daemon is absent.
      let cleanupFailure: unknown;
      for (const session of [config.session, config.guest]) {
        try { await closeExact(session); } catch (error) { cleanupFailure ??= error; }
      }
      if (cleanupFailure) throw cleanupFailure;
      proof.nativeSessionsAbsent = true;
    } else {
      await prepareBrowserSessionState(spec.command, activeSession, { env: spec.env, persistent: phase !== "guest" });
      assert.equal(spec.env.AGENT_BROWSER_RESTORE, browserRestoreKey(activeSession));
      assert.equal(spec.env.AGENT_BROWSER_RESTORE_SAVE, phase === "guest" ? "never" : "auto");
      assert.equal(spec.env.AGENT_BROWSER_EXECUTABLE_PATH, config.executablePath);
      if (phase === "initial") {
        await call("open", { url: `${config.origin}/login` });
        assert((await call("get_text", { selector: "main" })).includes(config.marker), "Initial native login did not reach the protected page.");
        await call("eval", { script: `localStorage.setItem('grokoff-fixture-login', ${JSON.stringify(config.storageMarker)})` });
      } else {
        // The login endpoint is deliberately never opened again. The protected
        // server checks an HttpOnly cookie, not browser-reported account text.
        await call("open", { url: `${config.origin}/protected` });
        const text = await call("get_text", { selector: "main" });
        if (phase === "restored") assert(text.includes(config.marker), "Fresh native browser lost its saved synthetic login.");
        else assert(text.includes("Unauthenticated fixture profile") && !text.includes(config.marker), "A new profile inherited another profile's login.");
      }
      const storage = await call("eval", { script: "localStorage.getItem('grokoff-fixture-login')" });
      assert.equal(storage.includes(config.storageMarker), phase !== "guest", "localStorage restoration/profile isolation failed.");
      const rawPid = readFileSync(nativePidFile(activeSession), "utf8").trim();
      assert(/^[1-9][0-9]*$/.test(rawPid), "Owned native daemon has no valid PID.");
      daemonPid = Number(rawPid);
      proof.daemonPid = daemonPid;
      proof.savedLogin = phase !== "guest";
      proof.savedLocalStorage = phase !== "guest";
    }
  } catch (error) { failure = error; }
  finally {
    try { await runtime.closeAll(); } catch (error) { failure ??= error; }
    try {
      if (phase !== "cleanup") {
        await closeExact(activeSession);
        if (daemonPid) await waitForPidExit(daemonPid);
        proof.nativeSessionAbsent = true;
        proof.daemonExited = daemonPid !== undefined;
        const directory = join(config.home, ".agent-browser", "namespaces", config.env.AGENT_BROWSER_NAMESPACE!, "state", "sessions");
        const state = join(directory, `${browserRestoreKey(activeSession)}-${activeSession}.json.enc`);
        const plain = state.slice(0, -4);
        if (phase === "guest") {
          assert(!existsSync(state) && !existsSync(plain), "Guest profile wrote saved browser state.");
          proof.guestStateAbsent = true;
        } else {
          assert(existsSync(state) && !existsSync(plain), "Persistent login did not produce encrypted saved state.");
          const saved = readFileSync(state);
          assert(saved.length > 0 && !saved.includes(config.storageMarker), "Saved browser state contains a plaintext fixture marker.");
          proof.encryptedState = { bytes: saved.length, sha256: createHash("sha256").update(saved).digest("hex") };
          if (process.platform !== "win32") assert.equal(statSync(join(config.dataDir, "browser-engine-key")).mode & 0o777, 0o600);
        }
      }
    } catch (error) { failure ??= error; }
    proof.passed = !failure;
    if (failure) proof.error = failure instanceof Error ? failure.message : String(failure);
    writeFileSync(join(config.output, `${phase}.json`), JSON.stringify(proof, null, 2), { mode: 0o600 });
  }
  if (failure) throw failure;
}

async function waitForPidExit(pid: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return; throw error; }
    await new Promise(resolveWait => setTimeout(resolveWait, 25));
  }
  throw new Error(`Owned native daemon ${pid} remained alive after close.`);
}

async function verify(bundle: string): Promise<void> {
  const target = `${process.platform}-${process.arch}`;
  const manifest = verifyBrowserBundle(bundle, target);
  const paths = browserBundlePaths(bundle, target);
  const output = join(root, ".local", `browser-login-${Date.now()}`);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  // macOS's per-user temp root can exceed the native Unix socket path limit.
  const scratch = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/tmp", "gof-login-"));
  const home = join(scratch, "h");
  const dataDir = join(scratch, "data");
  for (const name of [home, dataDir, join(scratch, "s"), join(scratch, "tmp")]) mkdirSync(name, { mode: 0o700 });
  const cookie = randomBytes(32).toString("hex");
  const marker = `Authenticated synthetic account ${randomUUID()}`;
  const storageMarker = randomUUID();
  const requests: Array<{ phase: Phase; path: string; authorized: boolean; status: number }> = [];
  let phase: Phase = "initial";
  let child: ChildProcess | undefined;
  let interrupted = false;
  let cleanupConfirmed = false;
  let failure: unknown;
  const receipt: Record<string, unknown> = {
    startedAt: new Date().toISOString(), bundle, target, scratch,
    engineVersion: manifest.engine.version, chromeVersion: manifest.chrome.version,
    bundleInventoryVerified: true,
    boundary: "Real pinned native helper/Chrome and production restore/encryption functions. Synthetic loopback cookie/localStorage only; no provider, account, keychain, live app or personal browser state. Fresh worker processes/native daemons prove saved-state restoration, not a surviving daemon. This does not prove the packaged-app UI or real website login policies.",
  };
  const persist = () => writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  persist();
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const authorized = (req.headers.cookie ?? "").split(/;\s*/).includes(`grokoff_fixture=${cookie}`);
    const status = path === "/login" ? 303 : path === "/protected" ? authorized ? 200 : 403 : 404;
    requests.push({ phase, path, authorized, status });
    res.setHeader("cache-control", "no-store");
    if (path === "/login") {
      res.writeHead(status, { location: "/protected", "set-cookie": `grokoff_fixture=${cookie}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax` });
      res.end();
    } else {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><title>GrokOff synthetic login</title><main>${path === "/protected" ? authorized ? marker : "Unauthenticated fixture profile" : "No fixture page"}</main>`);
    }
  });
  const interrupt = () => { interrupted = true; child?.kill("SIGTERM"); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  try {
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const env: Record<string, string> = {
      PATH: process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32") : "/usr/bin:/bin",
      HOME: home, USERPROFILE: home, GROKOFF_DATA_DIR: dataDir,
      TMPDIR: join(scratch, "tmp"), TMP: join(scratch, "tmp"), TEMP: join(scratch, "tmp"),
      XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home,
      AGENT_BROWSER_NAMESPACE: `gof-login-${randomBytes(4).toString("hex")}`,
      AGENT_BROWSER_SOCKET_DIR: join(scratch, "s"), AGENT_BROWSER_EXECUTABLE_PATH: paths.chrome,
    };
    for (const key of ["SystemRoot", "WINDIR", "SYSTEMDRIVE", "COMSPEC", "PATHEXT"]) {
      if (process.platform === "win32" && process.env[key]) env[key] = process.env[key]!;
    }
    const config: FixtureConfig = { home, dataDir, output, origin, binaryPath: paths.engine, executablePath: paths.chrome,
      session: `login-${randomBytes(6).toString("hex")}`, guest: `guest-${randomBytes(6).toString("hex")}`, marker, storageMarker, env };
    const configPath = join(scratch, "fixture.json");
    writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
    receipt.ownedFixture = { home, dataDir, origin, namespace: env.AGENT_BROWSER_NAMESPACE, socketDirectory: env.AGENT_BROWSER_SOCKET_DIR, session: config.session, guest: config.guest };
    const runPhase = async (next: Phase) => {
      phase = next;
      assert(!interrupted || next === "cleanup", "Fixture interrupted.");
      child = spawn(process.execPath, ["--experimental-strip-types", script, "--fixture", configPath, "--phase", next], {
        cwd: scratch, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      const ownedChild = child;
      let logBytes = 0;
      for (const stream of [ownedChild.stdout!, ownedChild.stderr!]) stream.on("data", (chunk: Buffer) => {
        const remaining = Math.max(0, 128 * 1024 - logBytes);
        if (remaining) appendFileSync(join(output, `${next}.log`), chunk.subarray(0, remaining));
        logBytes += chunk.length;
        if (logBytes > 128 * 1024) ownedChild.kill("SIGTERM");
      });
      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => { timedOut = true; ownedChild.kill("SIGTERM"); killTimer = setTimeout(() => ownedChild.kill("SIGKILL"), 5_000); }, 60_000);
      // Even an early, successful worker exit can leave inherited pipes open.
      // Bound drain after every exact worker exit so native cleanup can run.
      boundBrowserWorkerStreamDrain(ownedChild);
      try {
        const code = await new Promise<number | null>((done, reject) => { ownedChild.once("error", reject); ownedChild.once("close", done); });
        assert(!timedOut && logBytes <= 128 * 1024 && code === 0, `${next} worker failed; inspect ${join(output, `${next}.log`)}`);
        const proof = JSON.parse(readFileSync(join(output, `${next}.json`), "utf8"));
        assert(proof.passed, `${next} worker did not confirm success.`);
        receipt[next] = proof;
        persist();
        return proof as { workerPid: number; daemonPid: number };
      } finally { clearTimeout(timer); clearTimeout(killTimer); child = undefined; }
    };
    let phaseFailure: unknown;
    try {
      const initial = await runPhase("initial");
      const restored = await runPhase("restored");
      assert.notEqual(initial.workerPid, restored.workerPid, "Restoration reused the original worker process.");
      assert.notEqual(initial.daemonPid, restored.daemonPid, "Restoration reused the original native daemon.");
      await runPhase("guest");
      assert.equal(requests.filter(request => request.path === "/login").length, 1, "The test reauthenticated instead of restoring saved state.");
      for (const checked of ["initial", "restored"] as const) {
        assert(requests.some(request => request.phase === checked && request.path === "/protected" && request.authorized && request.status === 200), `${checked} did not send an authenticated native HTTP request.`);
      }
      assert(requests.some(request => request.phase === "guest" && request.path === "/protected" && !request.authorized && request.status === 403), "New-profile control did not make an unauthenticated native HTTP request.");
      receipt.checks = { nativeDaemonReplaced: true, workerProcessReplaced: true, loginRequests: 1, persistentHttpOnlyCookieRestored: true, localStorageRestored: true, newProfileUnauthenticated: true, guestStateNotSaved: true };
    } catch (error) { phaseFailure = error; }
    finally {
      try { await runPhase("cleanup"); cleanupConfirmed = true; }
      catch (error) { receipt.cleanupError = error instanceof Error ? error.message : String(error); phaseFailure ??= error; }
    }
    if (phaseFailure) throw phaseFailure;
  } catch (error) { failure = error; }
  finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>(done => server.close(() => done()));
    if (cleanupConfirmed) rmSync(scratch, { recursive: true, force: true });
    receipt.requests = requests;
    receipt.cleanup = { nativeSessionsAbsent: cleanupConfirmed, workersExited: child === undefined, loopbackServerStopped: !server.listening,
      scratchRemoved: !existsSync(scratch), ...(existsSync(scratch) ? { retainedScratch: scratch } : {}) };
    receipt.passed = !failure && !interrupted && cleanupConfirmed && !existsSync(scratch);
    receipt.endedAt = new Date().toISOString();
    if (failure) receipt.error = failure instanceof Error ? failure.message : String(failure);
    persist();
    process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
  }
  console.log(JSON.stringify({ passed: receipt.passed, receipt: join(output, "receipt.json") }));
  if (failure) throw failure;
  assert(receipt.passed, "Synthetic saved-login verification did not finish cleanly.");
}
