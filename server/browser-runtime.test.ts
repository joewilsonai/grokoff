// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRuntime, TransportError, browserCommandEnv, browserRuntimeEnv, defaultBrowserSocketDirectory, type BrowserSpawnSpec } from "./browser-runtime.ts";

// Own these paths locally as well as using the suite-wide setup isolation.
// An alternate Vitest config must never make cleanup follow a developer's HOME
// or inherited native-browser socket override.
const suiteHome = mkdtempSync(join(tmpdir(), "grokoff-runtime-suite-"));
const fixtureEnv = (home = suiteHome): BrowserSpawnSpec["env"] => ({
  HOME: home, USERPROFILE: home, PATH: process.env.PATH,
  AGENT_BROWSER_NAMESPACE: "grokoff", AGENT_BROWSER_SOCKET_DIR: "",
});
const defaultTestSockets = defaultBrowserSocketDirectory(fixtureEnv());
afterAll(() => {
  rmSync(defaultTestSockets, { recursive: true, force: true });
  rmSync(suiteHome, { recursive: true, force: true });
});

describe("private browser runtime sockets", () => {
  const scratch: string[] = [];
  afterEach(() => { vi.restoreAllMocks(); for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });
  function fixture() {
    const home = mkdtempSync(join(tmpdir(), "grokoff-browser-sockets-"));
    const env = browserRuntimeEnv(fixtureEnv(home));
    scratch.push(home, env.AGENT_BROWSER_SOCKET_DIR!);
    return { home, env };
  }

  it("uses stable sockets per home and namespace and keeps ordinary UUID profiles below the native Mac limit", () => {
    const { home, env } = fixture();
    expect(browserRuntimeEnv(fixtureEnv(home)).AGENT_BROWSER_SOCKET_DIR).toBe(env.AGENT_BROWSER_SOCKET_DIR);
    expect(browserRuntimeEnv(fixtureEnv(`${home}-other`)).AGENT_BROWSER_SOCKET_DIR).not.toBe(env.AGENT_BROWSER_SOCKET_DIR);
    expect(browserRuntimeEnv({ ...fixtureEnv(home), AGENT_BROWSER_NAMESPACE: "other-app" }).AGENT_BROWSER_SOCKET_DIR).not.toBe(env.AGENT_BROWSER_SOCKET_DIR);
    if (process.platform !== "win32") {
      for (const session of ["bot-7dfc2147-e601-4a19-8b5c-4e718cd99733", "guest-7dfc2147-e601-4a19-8b5c-4e718cd99733"]) {
        expect(Buffer.byteLength(join(env.AGENT_BROWSER_SOCKET_DIR!, "namespaces", "grokoff", "run", `${session}.sock`))).toBeLessThanOrEqual(103);
      }
    }
  });

  it("preserves explicit fixture sockets", () => {
    const { home } = fixture();
    const sockets = join(home, "s");
    expect(browserRuntimeEnv({ ...fixtureEnv(home), AGENT_BROWSER_SOCKET_DIR: sockets }).AGENT_BROWSER_SOCKET_DIR).toBe(sockets);
  });

  it.skipIf(process.platform === "win32")("creates an owner-only runtime directory and tightens its permissions", () => {
    const { env } = fixture();
    mkdirSync(env.AGENT_BROWSER_SOCKET_DIR!, { mode: 0o755 });
    browserCommandEnv(env);
    expect(statSync(env.AGENT_BROWSER_SOCKET_DIR!).mode & 0o777).toBe(0o700);
  });

  it.skipIf(process.platform === "win32")("rejects a symlink at the default trust boundary", () => {
    const { home, env } = fixture();
    symlinkSync(home, env.AGENT_BROWSER_SOCKET_DIR!);
    expect(() => browserCommandEnv(env)).toThrow(/not safely owned/);
  });

  it.skipIf(!process.getuid)("rejects a default directory owned by a different uid", () => {
    const realUid = process.getuid!();
    vi.spyOn(process, "getuid").mockReturnValue(realUid + 1);
    const { env } = fixture();
    expect(() => browserCommandEnv(env)).toThrow(/not safely owned/);
  });

  it.skipIf(process.platform === "win32")("rejects overlong session sockets before a daemon can start", () => {
    const { env } = fixture();
    expect(() => browserCommandEnv({ ...env, AGENT_BROWSER_SESSION: "a".repeat(96) })).toThrow(/profile name is too long/);
  });
});

const runtimes: BrowserRuntime[] = [];
function runtime(options: ConstructorParameters<typeof BrowserRuntime>[0] = {}) {
  const value = new BrowserRuntime({ requestTimeoutMs: 1_000, takeoverTimeoutMs: 100, idleMs: 1_000, ...options });
  runtimes.push(value);
  return value;
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(async () => { await Promise.all(runtimes.splice(0).map((value) => value.closeAll())); });

describe("browser takeover gate", () => {
  it("immediately blocks shared-session reads and writes, while unrelated sessions work", async () => {
    const value = runtime();
    const action = deferred<string>();
    const pending = value.withAgentAction("shared-profile", () => action.promise);
    const observed = expect(pending).rejects.toThrow(/paused/);
    const taking = value.take("shared-profile", "person");
    expect(value.heldBy("shared-profile")).toBe("person");
    expect(value.canControl("shared-profile", "person")).toBe(false);
    const screenshot = vi.fn();
    await expect(value.withAgentAction("shared-profile", screenshot)).rejects.toThrow(/paused/);
    expect(screenshot).not.toHaveBeenCalled();
    await expect(value.withAgentAction("different-profile", async () => 42)).resolves.toBe(42);
    action.resolve("old screenshot never reaches bot");
    await observed;
    await taking;
    expect(value.canControl("shared-profile", "person")).toBe(true);
    expect(value.canControl("shared-profile", "other-person")).toBe(false);
  });

  it("retains a non-controllable hold when draining times out, even if the action finishes later", async () => {
    const value = runtime({ takeoverTimeoutMs: 20 });
    const action = deferred();
    const pending = value.withAgentAction("s", () => action.promise);
    const observed = expect(pending).rejects.toThrow(/paused/);
    await expect(value.take("s", "owner")).rejects.toThrow(/still finishing/);
    expect(value.heldBy("s")).toBe("owner");
    action.resolve();
    await observed;
    expect(value.canControl("s", "owner")).toBe(false);
    await value.take("s", "owner");
    expect(value.canControl("s", "owner")).toBe(true);
  });

  it("only the owner can release, and pending human actions drain before agents resume", async () => {
    const value = runtime();
    await value.take("s", "owner");
    await expect(value.take("s", "other")).rejects.toThrow(/Another person/);
    value.release("s", "other");
    expect(value.heldBy("s")).toBe("owner");
    const typed = deferred();
    const human = value.withHumanAction("s", "owner", () => typed.promise);
    value.release("s", "owner");
    expect(value.canControl("s", "owner")).toBe(false);
    expect(value.heldBy("s")).toBe("owner");
    await expect(value.withAgentAction("s", async () => "snapshot")).rejects.toThrow(/paused/);
    await expect(value.withHumanAction("s", "owner", async () => "click")).rejects.toThrow(/Take control/);
    typed.resolve();
    await human;
    expect(value.heldBy("s")).toBeNull();
    await expect(value.withAgentAction("s", async () => "safe screenshot")).resolves.toBe("safe screenshot");
  });

  it("says whether a take waited for the bot's action, and when an interruption needs a restart", async () => {
    const value = runtime();
    await expect(value.take("s", "owner")).resolves.toBe(false);
    value.release("s", "owner");
    const action = deferred();
    const pending = value.withAgentAction("s", () => action.promise);
    const observed = expect(pending).rejects.toThrow(/paused/);
    const taking = value.take("s", "owner");
    action.resolve(); await observed;
    await expect(taking).resolves.toBe(true);
    expect(value.interrupted("s")).toBe(false);
    await expect(value.withHumanAction("s", "owner", async () => { throw new Error("navigation timed out"); })).rejects.toThrow(/timed out/);
    expect(value.interrupted("s")).toBe(true);
    await value.close("s");
    expect(value.interrupted("s")).toBe(false);
  });

  it("release cancels an in-flight take and does not grant control afterwards", async () => {
    const value = runtime();
    const action = deferred();
    const pending = value.withAgentAction("s", () => action.promise);
    const taking = value.take("s", "owner");
    const observed = expect(taking).rejects.toThrow(/cancelled/);
    value.release("s", "owner");
    await observed;
    action.resolve();
    await pending;
    expect(value.canControl("s", "owner")).toBe(false);
  });

  it("failed actions release their counters and closing a transport does not release the owner", async () => {
    const value = runtime();
    await expect(value.withAgentAction("s", async () => { throw new Error("bad action"); })).rejects.toThrow("bad action");
    await value.take("s", "owner");
    await value.close("s");
    expect(value.heldBy("s")).toBe("owner");
    expect(value.canControl("s", "owner")).toBe(false);
    await value.take("s", "owner");
    expect(value.canControl("s", "owner")).toBe(true);
  });

  it("does not resume agents after an interrupted human command until browser recovery", async () => {
    const value = runtime();
    await value.take("s", "owner");
    await expect(value.withHumanAction("s", "owner", async () => { throw new Error("navigation timed out"); })).rejects.toThrow(/timed out/);
    value.release("s", "owner");
    await expect(value.withAgentAction("s", async () => "snapshot")).rejects.toThrow(/Restart/);
    await expect(value.take("s", "owner")).rejects.toThrow(/may still be running/);
    await value.close("s");
    value.release("s", "owner");
    await expect(value.withAgentAction("s", async () => "recovered")).resolves.toBe("recovered");
  });

  it("requires recovery for abandoned pressed input, but ignores stale or unrelated owners", async () => {
    const value = runtime();
    await value.take("s", "owner");
    value.abandonHumanInput("s", "other");
    expect(value.canControl("s", "owner")).toBe(true);
    value.abandonHumanInput("s", "owner");
    expect(value.canControl("s", "owner")).toBe(false);
    value.release("s", "owner");
    await expect(value.withAgentAction("s", async () => "click with stuck modifier")).rejects.toThrow(/Restart/);
    await value.restart("s", "new-viewer", async () => {});
    value.abandonHumanInput("s", "owner");
    await expect(value.withAgentAction("s", async () => "fresh input state")).resolves.toBe("fresh input state");
  });

  it("restarts exclusively and retains an uncertain hold if native close fails", async () => {
    const value = runtime();
    await expect(value.restart("s", "recovery", async () => { throw new Error("close timed out"); })).rejects.toThrow(/timed out/);
    expect(value.heldBy("s")).toBe("recovery");
    expect(value.canControl("s", "recovery")).toBe(false);
    const closing = deferred();
    const restart = value.restart("s", "recovery", () => closing.promise);
    await expect(value.withAgentAction("s", async () => "click")).rejects.toThrow(/paused/);
    await expect(value.withHumanAction("s", "recovery", async () => "click")).rejects.toThrow(/Take control/);
    closing.resolve();
    await restart;
    expect(value.heldBy("s")).toBeNull();
    await expect(value.withAgentAction("s", async () => "recovered")).resolves.toBe("recovered");
  });

  it("will not restart active actions or another person's held browser", async () => {
    const value = runtime();
    const nativeClose = vi.fn(async () => {});
    const busy = deferred();
    const agent = value.withAgentAction("s", () => busy.promise);
    await expect(value.restart("s", "recovery", nativeClose)).rejects.toThrow(/busy/);
    busy.resolve();
    await agent;
    await value.take("s", "other");
    await expect(value.restart("s", "recovery", nativeClose)).rejects.toThrow(/Another person/);
    expect(nativeClose).not.toHaveBeenCalled();
  });
});

const FAKE_MCP = `
const lines = require('node:readline').createInterface({input:process.stdin});
let initialized = false;
let rpcTimeoutCalls = 0;
lines.on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'notifications/initialized') { initialized = true; return; }
  let result;
  if (m.method === 'initialize') result = { protocolVersion:'2024-11-05',capabilities:{tools:{}} };
  else if (m.method === 'tools/list') result = { tools:[{name:'echo'}],pid:process.pid,initialized };
  else if (m.params.name === 'hang') return;
  else if (m.params.name === 'delayed-action') {
    require('node:fs').writeFileSync(process.env.ACTION_STARTED, 'accepted');
    setTimeout(() => {
      const fs = require('node:fs');
      if (!process.env.ACTION_NATIVE_CLOSED || !fs.existsSync(process.env.ACTION_NATIVE_CLOSED)) fs.writeFileSync(process.env.ACTION_FINISHED, 'finished');
      if (process.env.ACTION_SETTLED) fs.writeFileSync(process.env.ACTION_SETTLED, 'settled');
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'late result'}]}})+'\\n');
    }, 250);
    if (process.env.HOLD_TRANSPORT === '1') setInterval(() => {}, 1000);
    return;
  }
  else if (m.params.name === 'crash') process.exit(23);
  else if (m.params.name === 'oversized') { process.stdout.write('x'.repeat(16777217)); return; }
  else if (m.params.name === 'bulky') result = { content:[{type:'text',text:'x'.repeat(50000)},{type:'image',data:'AAAA',mimeType:'image/png'}], structuredContent:{ huge: 'y'.repeat(200000) } };
  else if (m.params.name === 'rpc-error') { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-1,message:'Expected refusal'}})+'\\n'); return; }
  else if (m.params.name === 'rpc-timeout') { rpcTimeoutCalls += 1; if (rpcTimeoutCalls === 1) { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-1,message:'request timed out'}})+'\\n'); return; } result = { content:[{type:'text',text:'engine answered a repeat rpc-timeout call'}] }; }
  else if (m.params.name === 'agent_browser_open' && m.params.arguments.url === 'https://refused.test') result = { isError:true, content:[{type:'text',text:'Navigation refused'}] };
  else if (m.params.name === 'agent_browser_snapshot' && process.env.REJECT_VERIFICATION === '1') { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-1,message:'Snapshot refused'}})+'\\n'); return; }
  else if (m.params.name === 'agent_browser_snapshot' && process.env.HANG_VERIFICATION === '1') return;
  else if (m.params.name === 'agent_browser_snapshot' && process.env.EMPTY_VERIFICATION === '1') result = { content:[] };
  else if (m.params.name === 'agent_browser_snapshot' && process.env.FAIL_VERIFICATION === '1') result = { isError:true, content:[{type:'text',text:'Snapshot unavailable'}] };
  else result = { content:[{type:'text',text:JSON.stringify(m.params)}],pid:process.pid };
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
});
`;
const spec = (): BrowserSpawnSpec => ({ command: process.execPath, args: ["-e", FAKE_MCP], env: fixtureEnv() });

describe("server-owned browser MCP runtime", () => {
  it("closes native work before waiting for a slow transport to retire", async () => {
    const home = mkdtempSync(join(tmpdir(), "grokoff-browser-stop-fast-"));
    const browser = spec();
    Object.assign(browser.env, {
      ACTION_STARTED: join(home, "accepted"), ACTION_FINISHED: join(home, "finished"),
      ACTION_NATIVE_CLOSED: join(home, "closed"), ACTION_SETTLED: join(home, "settled"), HOLD_TRANSPORT: "1",
    });
    const closeBrowser = vi.fn(async () => { writeFileSync(browser.env.ACTION_NATIVE_CLOSED!, "closed"); return true; });
    const value = runtime({ closeBrowser });
    try {
      const pending = value.agentRpc("slow-transport", browser, "tools/call", { name: "delayed-action" }, undefined, "stopped-turn");
      const rejected = expect(pending).rejects.toThrow(/stopped/i);
      await vi.waitFor(() => expect(existsSync(browser.env.ACTION_STARTED!)).toBe(true));
      value.stopTurn("stopped-turn");
      await rejected;
      // The fixture keeps its transport alive beyond the 250 ms action. Native
      // close must interrupt the action while transport retirement is pending.
      await vi.waitFor(() => expect(existsSync(browser.env.ACTION_SETTLED!)).toBe(true));
      expect(closeBrowser).toHaveBeenCalledTimes(1);
      expect(existsSync(browser.env.ACTION_FINISHED!)).toBe(false);
      await expect(value.agentRpc("slow-transport", browser, "tools/call", { name: "restart_browser" })).rejects.toThrow(/busy/);
    } finally {
      await value.closeAll();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it.each(["hang", "crash"])("retains uncertain native work after %s for Stop and drops old ownership after recovery", async (failure) => {
    const closeBrowser = vi.fn(async () => false);
    const value = runtime({ requestTimeoutMs: 1_000, closeBrowser });
    await value.agentRpc("timed-out", spec(), "tools/list", {});
    await expect(value.agentRpc("timed-out", spec(), "tools/call", { name: failure }, undefined, "timed-out-turn")).rejects.toThrow(/timed out|closed/);
    expect(value.interrupted("timed-out")).toBe(true);
    value.stopTurn("timed-out-turn");
    await vi.waitFor(() => expect(closeBrowser).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => {
      await expect(value.agentRpc("timed-out", spec(), "tools/call", { name: "restart_browser" })).rejects.toThrow(/could not be closed/);
    });
    closeBrowser.mockResolvedValue(true);
    await value.agentRpc("timed-out", spec(), "tools/call", { name: "restart_browser" });
    closeBrowser.mockClear();
    await value.agentRpc("timed-out", spec(), "tools/call", { name: "echo" }, undefined, "replacement-turn");
    value.stopTurn("timed-out-turn");
    expect(closeBrowser).not.toHaveBeenCalled();
    expect(value.interrupted("timed-out")).toBe(false);
  });

  it("does not start a late close while explicit recovery already owns the browser", async () => {
    const closeBrowser = vi.fn(async () => true);
    const value = runtime({ closeBrowser });
    await expect(value.agentRpc("recovering", spec(), "tools/call", { name: "crash" }, undefined, "old-turn")).rejects.toThrow();
    const closure = deferred<boolean>();
    const recovery = value.agentRestart("recovering", () => closure.promise);
    value.stopTurn("old-turn");
    await Promise.resolve();
    expect(closeBrowser).not.toHaveBeenCalled();
    closure.resolve(true);
    await recovery;
    await expect(value.agentRpc("recovering", spec(), "tools/call", { name: "echo" }, undefined, "new-turn")).resolves.toBeTruthy();
    value.stopTurn("old-turn");
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it("stops a turn before dispatch without closing or poisoning its saved browser", async () => {
    const closeBrowser = vi.fn(async () => true);
    const value = runtime({ closeBrowser });
    const pending = value.agentRpc("not-dispatched", spec(), "tools/call", { name: "crash" }, undefined, "old-turn");
    value.stopTurn("old-turn");
    await expect(pending).rejects.toThrow(/stopped/i);
    expect(value.interrupted("not-dispatched")).toBe(false);
    expect(closeBrowser).not.toHaveBeenCalled();
    await expect(value.agentRpc("not-dispatched", spec(), "tools/call", { name: "echo" }, undefined, "new-turn")).resolves.toBeTruthy();
    // Late settlement of the retired owner must not close the new turn's browser.
    value.stopTurn("old-turn");
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it("drains a viewport launch before closing a stopped browser and requires explicit recovery", async () => {
    const viewport = deferred();
    const started = deferred();
    const closeBrowser = vi.fn(async () => true);
    const value = runtime({ closeBrowser, applyViewport: () => { started.resolve(); return viewport.promise; } });
    const pending = value.agentRpc("launching", spec(), "tools/call", { name: "crash" }, undefined, "launch-turn");
    await started.promise;
    value.stopTurn("launch-turn");
    expect(value.interrupted("launching")).toBe(true);
    expect(closeBrowser).not.toHaveBeenCalled();
    await expect(value.agentRpc("launching", spec(), "tools/call", { name: "echo" })).rejects.toThrow(/Restart/);
    viewport.resolve();
    await expect(pending).rejects.toThrow(/stopped/i);
    await vi.waitFor(() => expect(closeBrowser).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => {
      await expect(value.agentRpc("launching", spec(), "tools/call", { name: "restart_browser" })).resolves.toBeTruthy();
    });
    expect(value.interrupted("launching")).toBe(false);
    await expect(value.agentRpc("launching", spec(), "tools/call", { name: "echo" })).resolves.toBeTruthy();
  });

  it("retains a pending viewport launch after its transport exits and closes only after it drains", async () => {
    const viewport = deferred();
    const started = deferred();
    const closeBrowser = vi.fn(async () => true);
    const value = runtime({ closeBrowser, applyViewport: () => { started.resolve(); return viewport.promise; } });
    const browser = spec();
    const connection = await value.agentRpc("lost-launch", browser, "tools/list", {}) as { pid: number };
    const pending = value.agentRpc("lost-launch", browser, "tools/call", { name: "echo" }, undefined, "lost-launch-turn")
      .catch((error: unknown) => error);
    try {
      await started.promise;
      process.kill(connection.pid, "SIGTERM");
      await vi.waitFor(() => expect(() => process.kill(connection.pid, 0)).toThrow());
      // Let the owned child's close handler remove its transport entry.
      await new Promise<void>((resolve) => setImmediate(resolve));
      value.stopTurn("lost-launch-turn");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closeBrowser).not.toHaveBeenCalled();
      expect(value.interrupted("lost-launch")).toBe(true);
      await expect(value.agentRpc("lost-launch", browser, "tools/call", { name: "restart_browser" })).rejects.toThrow(/busy/);
      viewport.resolve();
      expect(await pending).toMatchObject({ message: expect.stringMatching(/stopped/i) });
      await vi.waitFor(() => expect(closeBrowser).toHaveBeenCalledTimes(1));
      await value.closeAll();
      value.stopTurn("lost-launch-turn");
      expect(closeBrowser).toHaveBeenCalledTimes(1);
    } finally {
      viewport.resolve();
      await pending;
      await value.closeAll();
    }
  });

  it("quarantines accepted browser work immediately when its owning turn stops", async () => {
    const home = mkdtempSync(join(tmpdir(), "grokoff-browser-stop-"));
    const closing = deferred<boolean>();
    const closeBrowser = vi.fn(() => closing.promise);
    const value = runtime({ closeBrowser });
    const browser = spec();
    browser.env.ACTION_STARTED = join(home, "accepted");
    browser.env.ACTION_FINISHED = join(home, "finished");
    try {
      const pending = value.agentRpc("stopped", browser, "tools/call", { name: "delayed-action" }, undefined, "old-turn");
      const rejected = expect(pending).rejects.toThrow(/stopped/i);
      await vi.waitFor(() => expect(existsSync(browser.env.ACTION_STARTED!)).toBe(true));
      value.stopTurn("old-turn");
      expect(value.interrupted("stopped")).toBe(true);
      await rejected;
      await expect(value.agentRpc("stopped", browser, "tools/call", { name: "echo" }, undefined, "new-turn")).rejects.toThrow(/Restart/);
      await expect(value.agentRpc("unrelated", spec(), "tools/call", { name: "echo" })).resolves.toBeTruthy();
      await vi.waitFor(() => expect(closeBrowser).toHaveBeenCalledWith("stopped", browser));
      closing.resolve(false);
      await vi.waitFor(() => expect(value.agentRpc("stopped", browser, "tools/call", { name: "restart_browser" })).rejects.toThrow(/could not be closed/));
      expect(value.interrupted("stopped")).toBe(true);
    } finally {
      closing.resolve(false);
      await value.closeAll();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it("does not turn a failed navigation or failed observation into success", async () => {
    const value = runtime();
    await expect(value.agentRpc("refused", spec(), "tools/call", {
      name: "agent_browser_open", arguments: { url: "https://refused.test" },
    })).resolves.toEqual({ isError: true, content: [{ type: "text", text: "Navigation refused" }] });
    const failing = spec();
    failing.env.FAIL_VERIFICATION = "1";
    const result = await value.agentRpc("unverified", failing, "tools/call", {
      name: "agent_browser_open", arguments: { url: "https://example.com" },
    }) as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[1].text).toContain("verification failed");
    expect(result.content[2].text).toBe("Snapshot unavailable");
  });
  it("preserves navigation when its observation rejects at the RPC level", async () => {
    const value = runtime(), failing = spec();
    failing.env.REJECT_VERIFICATION = "1";
    const result = await value.agentRpc("rejected-snapshot", failing, "tools/call", {
      name: "agent_browser_open", arguments: { url: "https://example.com" },
    }) as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).name).toBe("agent_browser_open");
    expect(result.content[1].text).toContain("verification failed");
    await expect(value.withAgentAction("rejected-snapshot", async () => "available")).resolves.toBe("available");
  });
  it("keeps transport uncertainty when post-navigation observation times out", async () => {
    const value = runtime({ requestTimeoutMs: 1_000 }), failing = spec();
    failing.env.HANG_VERIFICATION = "1";
    await expect(value.agentRpc("hung-snapshot", failing, "tools/call", {
      name: "agent_browser_open", arguments: { url: "https://example.com" },
    })).rejects.toBeInstanceOf(TransportError);
    await expect(value.withAgentAction("hung-snapshot", async () => "no")).rejects.toThrow(/Restart/);
  });
  it("does not claim page verification when the snapshot is empty", async () => {
    const empty = spec();
    empty.env.EMPTY_VERIFICATION = "1";
    const result = await runtime().agentRpc("empty-snapshot", empty, "tools/call", {
      name: "agent_browser_open", arguments: { url: "https://example.com" },
    }) as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[1].text).toContain("verification failed");
  });
  it("observes the same page after navigation without repeating the navigation", async () => {
    const value = runtime();
    const result = await value.agentRpc("verified-open", spec(), "tools/call", {
      name: "agent_browser_open", arguments: { url: "https://example.com", session: "wrong-session" },
    }) as { content: Array<{ text: string }> };
    expect(JSON.parse(result.content[0].text)).toEqual({ name: "agent_browser_open", arguments: { url: "https://example.com" } });
    expect(result.content[1].text).toContain("sign-in");
    expect(JSON.parse(result.content[2].text)).toEqual({ name: "agent_browser_snapshot", arguments: { compact: true } });
  });
  it("inherits only host plumbing and explicit engine settings", () => {
    vi.stubEnv("OPENAI_API_KEY", "must-not-inherit");
    try {
      const env = browserRuntimeEnv({ HOME: "/isolated/browser-home", AGENT_BROWSER_SESSION: "fixture" });
      expect(env.HOME).toBe("/isolated/browser-home");
      expect(env.AGENT_BROWSER_SESSION).toBe("fixture");
      expect(env.AGENT_BROWSER_NAMESPACE).toBe("grokoff");
      expect(env.PATH).toBe(process.env.PATH);
      expect(env.OPENAI_API_KEY).toBeUndefined();
    } finally { vi.unstubAllEnvs(); }
  });

  it("retains an explicit browser fixture namespace across runtime commands", () => {
    expect(browserRuntimeEnv({ AGENT_BROWSER_NAMESPACE: "fixture-browser" }).AGENT_BROWSER_NAMESPACE).toBe("fixture-browser");
    expect(browserRuntimeEnv({ AGENT_BROWSER_NAMESPACE: "" }).AGENT_BROWSER_NAMESPACE).toBe("grokoff");
  });

  it("rechecks a revoked capability after initialization and before forwarding", async () => {
    const value = runtime();
    let valid = true;
    const check = () => { if (!valid) throw new Error("capability revoked"); };
    const pending = value.agentRpc("s", spec(), "tools/call", { name: "crash" }, check);
    valid = false;
    await expect(pending).rejects.toThrow(/revoked/);
    await expect(value.agentRpc("s", spec(), "tools/list", {})).resolves.toMatchObject({ initialized: true });
    await value.take("s", "owner");
    expect(value.canControl("s", "owner")).toBe(true);
  });
  it("does not assume an MCP timeout stopped an accepted daemon action", async () => {
    const value = runtime({ requestTimeoutMs: 60 });
    // Advance only the deliberately hung request's deadline. Real subprocess
    // startup/stdio remain live, so a loaded runner cannot time out a healthy
    // recovery echo merely because its 60 ms scheduling window elapsed.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await expect(value.agentRpc("s", spec(), "tools/list", {})).resolves.toMatchObject({ initialized: true });
      const pending = value.agentRpc("s", spec(), "tools/call", { name: "hang" });
      const observed = expect(pending).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(60);
      await observed;
      // The real daemon detaches from its MCP parent. Transport exit is not
      // proof that a navigation or submission stopped; do not replay it.
      await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo" })).rejects.toThrow(/Restart/);
      await expect(value.take("s", "owner")).rejects.toThrow(/Restart/);
      await value.restart("s", "owner", async () => {});
      await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo", arguments: { text: "back" } }))
        .resolves.toMatchObject({ content: [{ text: expect.stringContaining("back") }] });
      await value.take("s", "owner");
      expect(value.canControl("s", "owner")).toBe(true);
    } finally {
      // Process-tree cleanup polls real child exits with timers of its own.
      vi.useRealTimers();
      await value.closeAll();
    }
  });

  it("surfaces an engine-reported JSON-RPC timeout instead of retrying it", async () => {
    // Only a TransportError timeout may be retried: its timer already killed
    // that child, so the next attempt starts a fresh transport. This engine
    // answers "request timed out" over a live transport, which is the engine
    // refusing rather than the plumbing failing; retrying would re-ask the
    // same wedged engine for the whole window.
    const value = runtime();
    // The fixture times out only the first rpc-timeout call and answers any
    // repeat distinctly, so a retry would resolve instead of reject: the
    // rejection below is proof the first timeout stayed the final outcome.
    const failure = value.agentRpc("s", spec(), "tools/call", { name: "rpc-timeout" });
    await expect(failure).rejects.toThrow(/request timed out/);
    await expect(failure).rejects.not.toBeInstanceOf(TransportError);
  });

  it("still refuses an agent after a human's own interrupted command, browser alive", async () => {
    // The other half of the contract: this uncertainty is NOT self-resolving,
    // because the browser is still running and may act again.
    const value = runtime();
    await value.agentRpc("s", spec(), "tools/list", {});
    await value.take("s", "owner");
    await expect(value.withHumanAction("s", "owner", async () => { throw new Error("navigation timed out"); })).rejects.toThrow(/timed out/);
    value.release("s", "owner");
    await expect(value.withAgentAction("s", async () => "snapshot")).rejects.toThrow(/Restart/);
  });

  it("initializes once, reuses its own session client, and supports concurrent ids", async () => {
    const value = runtime();
    const list = await value.agentRpc("one", spec(), "tools/list", {}) as { pid: number; initialized: boolean };
    expect(list.initialized).toBe(true);
    const responses = await Promise.all(["first", "second"].map((text) => value.agentRpc("one", spec(), "tools/call", { name: "echo", arguments: { text } }))) as Array<{ pid: number; content: Array<{ text: string }> }>;
    expect(responses.map((r) => r.pid)).toEqual([list.pid, list.pid]);
    expect(responses[0].content[0].text).toContain("first");
    expect(responses[1].content[0].text).toContain("second");
    const other = await value.agentRpc("two", spec(), "tools/list", {}) as { pid: number };
    expect(other.pid).not.toBe(list.pid);
    await value.take("one", "owner");
    await expect(value.agentRpc("one", spec(), "tools/call", { name: "echo" })).rejects.toThrow(/paused/);
    await expect(value.agentRpc("one", spec(), "tools/list", {})).resolves.toMatchObject({ tools: [{ name: "echo" }, { name: "restart_browser" }] });
  });

  it("lets the agent restart an interrupted browser itself, then resume", async () => {
    const closeBrowser = vi.fn(async () => true);
    const value = runtime({ closeBrowser });
    await value.agentRpc("s", spec(), "tools/list", {});
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "crash" })).rejects.toThrow();
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo" })).rejects.toThrow(/restart_browser/);
    // A new turn lists tools without reaching the engine: the engine's tools
    // from the last list, plus the one way out.
    const listed = await value.agentRpc("s", spec(), "tools/list", {}) as { tools: Array<{ name: string }> };
    expect(listed.tools.map((tool) => tool.name)).toEqual(["echo", "restart_browser"]);
    const check = vi.fn();
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "restart_browser", arguments: {} }, check))
      .resolves.toMatchObject({ content: [{ text: expect.stringContaining("Browser restarted") }] });
    expect(closeBrowser).toHaveBeenCalledWith("s", expect.objectContaining({ command: process.execPath }));
    expect(check).toHaveBeenCalledTimes(2);
    expect(value.heldBy("s")).toBeNull();
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo", arguments: { text: "back" } }))
      .resolves.toMatchObject({ content: [{ text: expect.stringContaining("back") }] });
  });

  it("stays uncertain without holding the browser when the agent's restart cannot close it", async () => {
    const value = runtime({ closeBrowser: async () => false });
    await value.agentRpc("s", spec(), "tools/list", {});
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "crash" })).rejects.toThrow();
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "restart_browser" })).rejects.toThrow(/could not be closed/);
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo" })).rejects.toThrow(/Restart/);
    // No agent-owned hold: the person's own Restart button still works.
    expect(value.heldBy("s")).toBeNull();
    await value.restart("s", "person", async () => {});
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo" })).resolves.toBeTruthy();
  });

  it("never lets the agent restart a browser a person controls, or after its turn is revoked", async () => {
    const closeBrowser = vi.fn(async () => true);
    const value = runtime({ closeBrowser });
    await value.agentRpc("s", spec(), "tools/list", {});
    await value.take("s", "person");
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "restart_browser" })).rejects.toThrow(/paused/);
    value.release("s", "person");
    const revoked = () => { throw new Error("capability revoked"); };
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "restart_browser" }, revoked)).rejects.toThrow(/revoked/);
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it("sizes the browser page once per transport, before the first call that may launch it", async () => {
    const order: string[] = [];
    const applyViewport = vi.fn(async () => { order.push("viewport"); return true; });
    const value = runtime({ applyViewport });
    await value.agentRpc("s", spec(), "tools/list", {});
    expect(applyViewport).not.toHaveBeenCalled();
    const first = await value.agentRpc("s", spec(), "tools/call", { name: "echo", arguments: { text: "first" } }) as { content: Array<{ text: string }> };
    order.push(first.content[0]!.text);
    await value.agentRpc("s", spec(), "tools/call", { name: "echo", arguments: { text: "second" } });
    expect(applyViewport).toHaveBeenCalledOnce();
    expect(applyViewport).toHaveBeenCalledWith(spec());
    expect(order[0]).toBe("viewport");
    expect(order[1]).toContain("first");
    await value.close("s");
    await value.agentRpc("s", spec(), "tools/call", { name: "echo" });
    expect(applyViewport).toHaveBeenCalledTimes(2);
  });

  it("still runs the bot's call when sizing the page fails", async () => {
    const value = runtime({ applyViewport: async () => { throw new Error("engine without viewport"); } });
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo", arguments: { text: "works" } })).resolves.toMatchObject({ content: [{ type: "text" }] });
  });

  it("keeps completed MCP refusals distinct from uncertain transport failure", async () => {
    const value = runtime();
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "rpc-error" })).rejects.toThrow("Expected refusal");
    await value.take("s", "owner");
    expect(value.canControl("s", "owner")).toBe(true);
  });

  it.each(["hang", "crash", "oversized"])("fails closed on %s, and can reconnect after explicit close", async (name) => {
    const value = runtime({ requestTimeoutMs: 250 });
    await expect(value.agentRpc("s", spec(), "tools/call", { name })).rejects.toThrow(/Browser/);
    await expect(value.take("s", "owner")).rejects.toThrow(/may still be running/);
    expect(value.canControl("s", "owner")).toBe(false);
    value.release("s", "owner");
    await value.close("s");
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo" })).resolves.toMatchObject({ content: [{ type: "text" }] });
  });

  it("rejects oversized requests without poisoning the session", async () => {
    const value = runtime();
    await expect(value.agentRpc("s", spec(), "tools/call", { name: "echo", arguments: { text: "x".repeat(1_048_577) } })).rejects.toThrow(/size limit/);
    await value.take("s", "owner");
    expect(value.canControl("s", "owner")).toBe(true);
  });

  it("bounds concurrent requests without queuing more work behind a hung action", async () => {
    const value = runtime({ maxPending: 1, requestTimeoutMs: 250 });
    await value.agentRpc("s", spec(), "tools/list", {});
    const pending = value.agentRpc("s", spec(), "tools/call", { name: "hang" });
    const observed = expect(pending).rejects.toThrow(/timed out/);
    await Promise.resolve();
    await expect(value.agentRpc("s", spec(), "tools/list", {})).rejects.toThrow(/Too many pending/);
    await observed;
  });

  it("evicts idle transports without dropping a human hold", async () => {
    const value = runtime({ idleMs: 30 });
    const before = await value.agentRpc("s", spec(), "tools/list", {}) as { pid: number };
    await value.take("s", "owner");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(value.heldBy("s")).toBe("owner");
    const after = await value.agentRpc("s", spec(), "tools/list", {}) as { pid: number };
    expect(after.pid).not.toBe(before.pid);
  });

  it.each([false, true])("retires an idle MCP client without killing its browser descendant (ignores EOF: %s)", async (ignoresEof) => {
    // Windows taskkill /T includes even a daemon with its own process group.
    // This inert descendant models that ownership boundary on every platform.
    // unref alone does not detach a Windows child from its parent's console.
    // Keep the POSIX group shared so an accidental group kill still fails here.
    const fake = `
      const browser = require('node:child_process').spawn(process.execPath,
        ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'],
        { stdio: ['ignore', 'pipe', 'ignore'], detached: process.platform === 'win32', windowsHide: true });
      browser.unref();
      let ready = false;
      let pending = null;
      const flush = () => {
        if (!ready || !pending) return;
        const m = pending; pending = null;
        const result = m.method === 'initialize' ? { protocolVersion: '2024-11-05' }
          : { tools: [], browserPid: browser.pid, transportPid: process.pid };
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
      };
      browser.stdout.once('data', () => { ready = true; browser.stdout.destroy(); flush(); });
      browser.stdout.on('error', () => {});
      ${ignoresEof ? "setInterval(() => {}, 1000);" : ""}
      require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
        const m = JSON.parse(line);
        if (!m.id) return;
        pending = m; flush();
      });

    `;
    const value = runtime({ idleMs: 40 });
    const launch = { command: process.execPath, args: ["-e", fake], env: fixtureEnv() };
    const first = await value.agentRpc("idle", launch, "tools/list", {}) as { browserPid: number; transportPid: number };
    try {
      expect(() => process.kill(first.browserPid, 0)).not.toThrow();
      await vi.waitFor(() => expect(() => process.kill(first.transportPid, 0)).toThrow(), { timeout: 2_000, interval: 30 });
      expect(() => process.kill(first.browserPid, 0)).not.toThrow();
    } finally {
      try { process.kill(first.browserPid, "SIGKILL"); } catch { /* fixture exited */ }
    }
  });
});

describe("browser MCP shaping at the runtime boundary", () => {
  it("strips harness-owned arguments before dispatch and bounds what a result puts into the conversation", async () => {
    const value = new BrowserRuntime({ idleMs: 500 });
    try {
      const echoed = await value.agentRpc("shape", spec(), "tools/call", { name: "echo", arguments: { text: "hi", session: "other-bot", extraArgs: ["--x"] } }) as { content: Array<{ text: string }> };
      expect(JSON.parse(echoed.content[0].text)).toEqual({ name: "echo", arguments: { text: "hi" } });
      const bulky = await value.agentRpc("shape", spec(), "tools/call", { name: "bulky" }) as Record<string, unknown> & { content: Array<{ type: string; text?: string }> };
      expect(bulky).not.toHaveProperty("structuredContent");
      expect(bulky.content).toHaveLength(2);
      expect(bulky.content[0].text!.length).toBeLessThan(33_000);
      expect(bulky.content[0].text).toContain("trimmed this tool result");
      expect(bulky.content[1]).toMatchObject({ type: "image" });
    } finally { await value.closeAll(); }
  });
});
