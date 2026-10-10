// GrokOff fixture regressions: private browser identity and teardown with an owned process.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserRuntimeEnv, defaultBrowserSocketDirectory } from "../../server/browser-runtime.ts";
import { waitForExit } from "../../server/testing/cleanup.ts";
import type { VerificationServer } from "../control-omb.ts";
import { cleanupUiFixture, prepareUiBrowserClose, sessionEnv } from "./control-omb-ui.ts";

const scratch: string[] = [];
const children: Array<ReturnType<typeof spawn>> = [];
const grandchildren: number[] = [];
const directory = (spaces = false) => {
  const home = mkdtempSync(join(tmpdir(), spaces ? "grokoff ui isolation-" : "grokoff-ui-isolation-"));
  scratch.push(home);
  return home;
};
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const child of children.splice(0)) {
    await waitForExit(child, { signal: "SIGTERM" });
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  }
  for (const pid of grandchildren.splice(0)) expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
  for (const home of scratch.splice(0)) rmSync(home, { recursive: true, force: true });
});

it.runIf(process.platform !== "win32").each([["before", false], ["after", false], ["before", true], ["after", true]] as const)("retains HOME for private orphan Chrome started %s capture (spaces:%s)", async (when, spaces) => {
  const home = directory(spaces);
  const env = sessionEnv({ home, session: "owned-ui", chrome: null }, {});
  const start = async () => {
    const chrome = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "--", `--user-data-dir=${join(home, "tmp", "owned-profile")}`], { stdio: "ignore" });
    children.push(chrome);
    await new Promise<void>((resolve, reject) => { chrome.once("spawn", resolve); chrome.once("error", reject); });
  };
  if (when === "before") await start();
  const close = vi.fn(async () => true);
  const prepared = prepareUiBrowserClose(process.execPath, env, { close, timeoutMs: 100 });
  if (when === "after") await start();
  const server = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(server);
  await new Promise<void>((resolve, reject) => { server.once("spawn", resolve); server.once("error", reject); });
  const remove = vi.fn(async () => { rmSync(home, { recursive: true, force: true }); });
  const fixture: VerificationServer = {
    child: server, close: remove, fixtureDumpPath: join(home, "fake.json"),
    info: { dataDir: home, pid: server.pid!, url: "http://127.0.0.1:1", logPath: join(home, "log") },
  };
  await expect(cleanupUiFixture({ fixture, closeBrowser: prepared })).rejects.toThrow(/retained/);
  expect(close).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(existsSync(home)).toBe(true);
});

it.runIf(process.platform !== "win32").each([false, true])("records discovered Chrome and distinct profile helpers through an owned tree (%s)", async (withHelper) => {
  const home = directory();
  const env = sessionEnv({ home, session: "owned-ui", chrome: withHelper ? process.execPath : null }, {});
  const sockets = env.AGENT_BROWSER_SOCKET_DIR!;
  expect(existsSync(sockets)).toBe(false);
  scratch.push(sockets);
  const run = join(sockets, "namespaces", "grokoff", "run");
  mkdirSync(run, { recursive: true, mode: 0o700 });
  const script = join(home, "fake-daemon.cjs");
  const browserCode = withHelper ? `const {spawn}=require('node:child_process');
const helper=spawn(process.execPath,['-e','setInterval(()=>{},1000)','--','--user-data-dir='+process.env.OWNED_PROFILE],{argv0:process.env.HOME+'/GoogleChromeHelper',stdio:'ignore'});
process.on('SIGTERM',()=>{helper.once('exit',()=>process.exit(0));helper.kill('SIGTERM');});
helper.once('spawn',()=>process.stdout.write(String(helper.pid)+'\\n'));
setInterval(()=>{},1000);` : "setInterval(()=>{},1000)";
  writeFileSync(script, `const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['-e',process.env.OWNED_BROWSER_CODE,'--','--user-data-dir='+process.env.OWNED_PROFILE],{stdio:['ignore','pipe','ignore']});
process.on('SIGTERM',()=>{child.once('exit',()=>process.exit(0));child.kill('SIGTERM');});
if(process.env.OWNED_HELPER==='1')child.stdout.once('data',chunk=>process.stdout.write(JSON.stringify({browser:child.pid,helper:Number(String(chunk).trim())})+'\\n'));
else child.once('spawn',()=>process.stdout.write(JSON.stringify({browser:child.pid,helper:null})+'\\n'));
setInterval(()=>{},1000);`);
  const daemon = spawn(process.execPath, [script], { env: { HOME: home, OWNED_PROFILE: join(home, "tmp", "auto-chrome"), OWNED_BROWSER_CODE: browserCode, OWNED_HELPER: withHelper ? "1" : "0" }, stdio: ["ignore", "pipe", "ignore"] });
  children.push(daemon);
  const receipt = await new Promise<{ browser: number; helper: number | null }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Owned child handshake timed out")), 5_000);
    daemon.once("error", (error) => { clearTimeout(timer); reject(error); });
    daemon.stdout!.once("data", (chunk) => { clearTimeout(timer); resolve(JSON.parse(String(chunk).trim())); });
  });
  const chromePid = receipt.browser;
  expect(chromePid).toBeGreaterThan(0);
  grandchildren.push(chromePid);
  if (receipt.helper) grandchildren.push(receipt.helper);
  writeFileSync(join(run, "owned-ui.pid"), String(daemon.pid));
  const close = vi.fn(async (_binary: string, closeEnv: NodeJS.ProcessEnv) => {
    expect(closeEnv.AGENT_BROWSER_EXECUTABLE_PATH).toBe(withHelper ? process.execPath : undefined);
    expect(closeEnv.AGENT_BROWSER_SESSION).toBe("owned-ui");
    await waitForExit(daemon, { signal: "SIGTERM" });
    rmSync(join(run, "owned-ui.pid"));
    return true;
  });
  expect(await prepareUiBrowserClose(process.execPath, env, { close, timeoutMs: 1_000 })()).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(() => process.kill(chromePid, 0)).toThrow(/ESRCH/);
  expect(existsSync(sockets)).toBe(false);
});

describe("owned browser fixture identity", () => {
  it("uses one canonical private namespace/socket identity for open, drive and close", () => {
    const home = directory();
    vi.stubEnv("AGENT_BROWSER_NAMESPACE", "parent-personal");
    vi.stubEnv("AGENT_BROWSER_SOCKET_DIR", join(directory(), "personal-socket"));
    vi.stubEnv("OPENAI_API_KEY", "synthetic-parent-key");
    const env = sessionEnv({ home, session: "owned-flow", chrome: "/fixture/chrome" }, { PATH: "/fixture/bin" });
    expect(env.HOME).toBe(home);
    expect(env.USERPROFILE).toBe(home);
    expect(env.XDG_CONFIG_HOME).toBe(join(home, ".config"));
    expect(env.AGENT_BROWSER_NAMESPACE).toBe("grokoff");
    expect(env.AGENT_BROWSER_SOCKET_DIR).toBe(defaultBrowserSocketDirectory(env));
    expect(browserRuntimeEnv(env).AGENT_BROWSER_SOCKET_DIR).toBe(env.AGENT_BROWSER_SOCKET_DIR);
    expect(browserRuntimeEnv(env).AGENT_BROWSER_NAMESPACE).toBe(env.AGENT_BROWSER_NAMESPACE);
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("keeps the same session name in two disposable homes on distinct socket roots", () => {
    const first = sessionEnv({ home: directory(), session: "same-flow", chrome: null }, {});
    const second = sessionEnv({ home: directory(), session: "same-flow", chrome: null }, {});
    expect(first.AGENT_BROWSER_SESSION).toBe(second.AGENT_BROWSER_SESSION);
    expect(first.AGENT_BROWSER_SOCKET_DIR).not.toBe(second.AGENT_BROWSER_SOCKET_DIR);
  });
});

it.each([false, true])("stops its exact owned server and retains HOME unless browser close is confirmed (%s)", async (closed) => {
  const home = directory();
  writeFileSync(join(home, "owned-marker"), "synthetic fixture state");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(child);
  await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  const remove = vi.fn(async () => { rmSync(home, { recursive: true, force: true }); });
  const preview = { previewUrl: "http://127.0.0.1:1/fixture", close: vi.fn(async () => {}) };
  const fixture: VerificationServer = {
    child, fixtureDumpPath: join(home, "fake-dump.json"), close: remove,
    info: { pid: child.pid!, dataDir: home, url: "http://127.0.0.1:1", logPath: join(home, "owned-log") },
  };
  const closing = cleanupUiFixture({ fixture, preview, closeBrowser: async () => closed });
  if (closed) await closing;
  else await expect(closing).rejects.toThrow(/retained/);
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  expect(() => process.kill(child.pid!, 0)).toThrow(/ESRCH/);
  expect(preview.close).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledTimes(closed ? 1 : 0);
  expect(existsSync(home)).toBe(!closed);
});

it.runIf(process.platform !== "win32").each([false, true])("closes both fixture sessions but retains HOME if close only acknowledges (%s)", async (exits) => {
  const home = directory();
  const env = sessionEnv({ home, session: "owned-ui", chrome: null }, {});
  const sockets = env.AGENT_BROWSER_SOCKET_DIR!;
  expect(existsSync(sockets)).toBe(false);
  scratch.push(sockets);
  const run = join(sockets, "namespaces", "grokoff", "run");
  mkdirSync(run, { recursive: true, mode: 0o700 });
  const owners = new Map<string, ReturnType<typeof spawn>>();
  for (const session of ["owned-ui", "bot-owned-fixture"]) {
    const daemon = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    children.push(daemon);
    await new Promise<void>((resolve, reject) => { daemon.once("spawn", resolve); daemon.once("error", reject); });
    owners.set(session, daemon);
    writeFileSync(join(run, `${session}.pid`), String(daemon.pid));
  }
  const server = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(server);
  await new Promise<void>((resolve, reject) => { server.once("spawn", resolve); server.once("error", reject); });
  const remove = vi.fn(async () => {
    for (const child of owners.values()) expect(() => process.kill(child.pid!, 0)).toThrow(/ESRCH/);
    rmSync(home, { recursive: true, force: true });
  });
  const close = vi.fn(async (_binary: string, closeEnv: NodeJS.ProcessEnv) => {
    expect(server.exitCode !== null || server.signalCode !== null).toBe(true);
    const session = closeEnv.AGENT_BROWSER_SESSION!;
    expect(owners.has(session)).toBe(true);
    expect(closeEnv.HOME).toBe(home);
    expect(closeEnv.AGENT_BROWSER_SOCKET_DIR).toBe(sockets);
    if (exits) await waitForExit(owners.get(session), { signal: "SIGTERM" });
    // Native inventory can report removal before the underlying process exits.
    rmSync(join(run, `${session}.pid`));
    return true;
  });
  const fixture: VerificationServer = {
    child: server, fixtureDumpPath: join(home, "fake.json"), close: remove,
    info: { pid: server.pid!, dataDir: home, url: "http://127.0.0.1:1", logPath: join(home, "log") },
  };
  const cleaning = cleanupUiFixture({ fixture, prepareBrowserClose: () => prepareUiBrowserClose(process.execPath, env, { close, timeoutMs: 250 }) });
  if (exits) await cleaning;
  else await expect(cleaning).rejects.toThrow(/retained/);
  expect(close).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(exits ? 1 : 0);
  expect(existsSync(home)).toBe(!exits);
});
