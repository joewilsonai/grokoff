// GrokOff modification (2026-10-10): inert subprocess/filesystem controls for the actual report cleanup path.
// No Electron, browser, server, provider, credentials or personal data are used.
import assert from "node:assert/strict";
import childProcess, { spawn } from "node:child_process";
import fs from "node:fs";
import { stripTypeScriptTypes, syncBuiltinESMExports } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test, mock } from "node:test";
import { cleanupBrowserReport, recordReportHome, recordReportOwner, removeReportHome,
  reportProcessAlive, signalReportOwner, stopReportOwner } from "./browser-report-cleanup.ts";

async function fixture(t, childCount = 1) {
  const roots = [], children = [], owners = [], homes = [];
  const addRoot = (location) => {
    const stat = fs.lstatSync(location);
    roots.push({ path: location, dev: stat.dev, ino: stat.ino });
  };
  const home = fs.mkdtempSync("/tmp/grokoff-report-cleanup-test-"); addRoot(home);
  const root = recordReportHome(homes, "fixture", home);
  assert.equal(root.uncertainty, undefined);
  t.after(async () => {
    for (const { good, exited } of children) {
      if (reportProcessAlive(good.pid)) signalReportOwner(good);
      await Promise.race([exited, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Inert child did not exit")), 3_000).unref())]);
      assert.equal(good.uncertainty, undefined);
      assert.equal(reportProcessAlive(good.pid), false);
    }
    for (const root of roots.reverse()) {
      if (!fs.existsSync(root.path)) continue;
      const current = fs.lstatSync(root.path);
      assert(current.isDirectory() && !current.isSymbolicLink());
      assert.equal(current.dev, root.dev); assert.equal(current.ino, root.ino);
      fs.rmSync(root.path, { recursive: true });
      assert.equal(fs.existsSync(root.path), false);
    }
    t.diagnostic(JSON.stringify({ pids: children.map(({ good }) => good.pid), allNumericPidsESRCH: true, allOwnedRootsAbsent: true }));
  });
  for (let index = 0; index < childCount; index++) {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000); setTimeout(() => process.exit(), 30000)", home],
      { stdio: "ignore", env: { PATH: path.dirname(process.execPath), HOME: home, TMPDIR: home } });
    const exited = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
    await new Promise((resolve) => child.once("spawn", resolve));
    const owner = recordReportOwner(owners, index ? "desktop-initial" : "server-original", child);
    children.push({ child, owner, good: { ...owner }, exited });
    assert.equal(owner.uncertainty, undefined); assert(owner.identity);
  }
  return { home, root, homes, owners, roots, children, addRoot };
}

const clean = (f, extra = {}) => cleanupBrowserReport({ owners: f.owners, homes: f.homes,
  browserUsed: false, closeRpc: async () => {}, startupUncertain: false, persist: () => {}, ...extra });
const posix = { skip: process.platform === "win32" };

test("an earlier closer failure still stops later owners, closes RPC/browser and persists a failed receipt", posix, async (t) => {
  const f = await fixture(t), calls = [];
  let persisted;
  const result = await clean(f, { browserUsed: true,
    prepareBrowserClose: () => { calls.push("prepare"); return async () => { calls.push("browser"); return true; }; },
    closePreview: async () => { calls.push("preview"); throw new Error("preview failed"); },
    closeRpc: async () => { calls.push("rpc"); }, persist: (value) => { calls.push("persist"); persisted = structuredClone(value); } });
  assert.deepEqual(calls, ["prepare", "preview", "rpc", "browser", "persist"]);
  assert.equal(result.confirmed, false); assert.equal(result.isolatedServerStopped, true);
  assert.equal(result.nativeBrowserStopped, true); assert.equal(result.temporaryHomesRemoved, false);
  assert.equal(persisted.confirmed, false); assert.match(result.errors[0], /preview failed/);
  assert(fs.existsSync(f.home));
});

test("a returning stop attempt with a real child still alive never reports exit or removes HOME", posix, async (t) => {
  const f = await fixture(t), child = f.children[0].child, originalKill = child.kill;
  child.kill = () => true;
  try {
    const result = await stopReportOwner(f.owners[0], 0);
    assert.equal(result.gone, false); assert.equal(reportProcessAlive(child.pid), true);
    assert.equal(removeReportHome(f.root, f.owners, true).removed, false);
    assert(fs.existsSync(f.home));
  } finally { child.kill = originalKill; }
});

test("exit between alive and identity observations is proven absence without erasing earlier uncertainty", posix, async (t) => {
  const f = await fixture(t, 0), syntheticPid = 2_147_483_000;
  let observations = 0, signals = 0, identityReads = 0;
  const owner = { label: "server-original", pid: syntheticPid, identity: "previously attested synthetic birth",
    child: { pid: syntheticPid, kill() { signals++; return true; } } };
  const realKill = process.kill, realExec = childProcess.execFileSync;
  const killPatch = mock.method(process, "kill", (pid, signal) => {
    if (pid !== syntheticPid) return realKill.call(process, pid, signal);
    assert.equal(signal, 0, "Only numeric liveness observations may touch the synthetic PID");
    if (observations++ === 0) return true;
    throw Object.assign(new Error("synthetic child exited"), { code: "ESRCH" });
  });
  const psPatch = mock.method(childProcess, "execFileSync", (file, args, options) => {
    if (file === "/bin/ps" && args[0] === "-p" && args[1] === String(syntheticPid)) {
      identityReads++;
      throw Object.assign(new Error("process vanished during identity observation"), { status: 1 });
    }
    return realExec(file, args, options);
  });
  syncBuiltinESMExports();
  try {
    const exited = await stopReportOwner(owner);
    assert.equal(identityReads, 1); assert.equal(exited.gone, true); assert.equal(exited.uncertainty, undefined);
    assert.equal(owner.uncertainty, undefined); assert.equal(signals, 0);
    const result = await clean({ ...f, owners: [owner] });
    assert.equal(result.confirmed, true); assert.equal(result.temporaryHomesRemoved, true);
    // Proven absence must not wipe a distinct earlier observation failure.
    const uncertain = { ...owner, uncertainty: "earlier observation failed" };
    const retained = await stopReportOwner(uncertain);
    assert.equal(retained.gone, true); assert.equal(retained.uncertainty, "earlier observation failed");
    assert.equal(signals, 0);
  } finally { killPatch.mock.restore(); psPatch.mock.restore(); syncBuiltinESMExports(); }
});

test("changed original birth/command gives no signal authority and retains HOME", posix, async (t) => {
  const f = await fixture(t);
  f.owners[0].identity += "changed";
  const result = await clean(f);
  assert.equal(f.children[0].child.killed, false); assert.equal(reportProcessAlive(f.owners[0].pid), true);
  assert.equal(result.isolatedServerStopped, false); assert.equal(result.temporaryHomesRemoved, false);
  assert.match(result.owners[0].uncertainty, /identity/);
});

for (const kind of ["malformed", "live omitted", "EIO"]) test(`${kind} process observation is retained and never signals`, posix, async (t) => {
  const f = await fixture(t), original = childProcess.execFileSync;
  const patch = mock.method(childProcess, "execFileSync", (file, args, options) => {
    if (file === "/bin/ps" && args[0] === "-p" && args[1] === String(f.owners[0].pid)) {
      if (kind === "malformed") return "unexpected nonempty output";
      const error = new Error(kind); if (kind === "live omitted") error.status = 1; else error.code = "EIO";
      throw error;
    }
    return original(file, args, options);
  });
  syncBuiltinESMExports();
  try {
    signalReportOwner(f.owners[0]);
    assert.equal(f.children[0].child.killed, false);
    assert(f.owners[0].uncertainty); assert.equal(reportProcessAlive(f.owners[0].pid), true);
  } finally { patch.mock.restore(); syncBuiltinESMExports(); }
  const result = await clean(f);
  assert.equal(result.confirmed, false); assert.equal(result.temporaryHomesRemoved, false);
});

test("an original completed desktop remains in the ledger and exact remaining owners permit measured removal", posix, async (t) => {
  const f = await fixture(t, 2);
  assert.equal((await stopReportOwner(f.owners[1])).gone, true);
  await f.children[1].exited;
  const result = await clean(f);
  assert.equal(result.confirmed, true); assert.equal(result.owners.length, 2);
  assert.equal(result.isolatedServerStopped, true); assert.equal(result.isolatedDesktopStopped, true);
  assert.equal(result.nativeBrowserStopped, null); assert.equal(result.temporaryHomesRemoved, true);
  assert.equal(fs.existsSync(f.home), false); assert.match(result.processScope, /not a complete descendant/);
});

for (const kind of ["false", "throws", "prepare throws"]) test(`native closer ${kind} retains HOME and still persists`, posix, async (t) => {
  const f = await fixture(t); let persisted = false, rpc = false;
  const result = await clean(f, { browserUsed: true, prepareBrowserClose: () => {
    if (kind === "prepare throws") throw new Error("prepare failed");
    return async () => { if (kind === "throws") throw new Error("close failed"); return false; };
  }, closeRpc: async () => { rpc = true; }, persist: () => { persisted = true; } });
  assert.equal(result.confirmed, false); assert.equal(result.nativeBrowserStopped, false);
  assert.equal(result.temporaryHomesRemoved, false); assert(fs.existsSync(f.home));
  assert.equal(rpc, true); assert.equal(persisted, true);
});

test("a nonsettling closer has a finite failed outcome and does not skip persistence", posix, async (t) => {
  const f = await fixture(t, 0); let persisted = false;
  const result = await clean(f, { closePreview: () => new Promise(() => {}), stepTimeoutMs: 10, persist: () => { persisted = true; } });
  assert.equal(result.confirmed, false); assert.equal(persisted, true); assert(fs.existsSync(f.home));
  assert.match(result.errors[0], /deadline/);
});

test("a replaced directory inode is never removed", posix, async (t) => {
  const f = await fixture(t, 0), moved = f.home + "-original";
  fs.renameSync(f.home, moved); f.roots[0].path = moved;
  fs.mkdirSync(f.home); f.addRoot(f.home);
  const result = await clean(f);
  assert.equal(result.confirmed, false); assert.equal(result.homes[0].removed, false);
  assert(fs.existsSync(f.home)); assert(fs.existsSync(moved));
});

test("changed owner-marker bytes prevent deletion", posix, async (t) => {
  const f = await fixture(t, 0);
  fs.writeFileSync(f.root.marker.path, "different owner");
  assert.equal((await clean(f)).temporaryHomesRemoved, false); assert(fs.existsSync(f.home));
});

test("a symlink replacement is never followed or removed", posix, async (t) => {
  const f = await fixture(t, 0), moved = f.home + "-original";
  fs.renameSync(f.home, moved); f.roots[0].path = moved; fs.symlinkSync(moved, f.home);
  try { assert.equal((await clean(f)).temporaryHomesRemoved, false); assert(fs.lstatSync(f.home).isSymbolicLink()); }
  finally { fs.unlinkSync(f.home); }
});

test("an unregistered path-referencing child only vetoes deletion and is not signalled", posix, async (t) => {
  const f = await fixture(t);
  const result = await clean({ ...f, owners: [] });
  assert.equal(result.confirmed, false); assert.equal(f.children[0].child.killed, false);
  assert(result.homes[0].references.some((line) => line.includes(String(f.owners[0].pid))));
  assert(fs.existsSync(f.home));
});

test("a returned remover is not proof when the actual directory remains", posix, async (t) => {
  const f = await fixture(t, 0), patch = mock.method(fs, "rmSync", () => {});
  syncBuiltinESMExports();
  try {
    const result = await clean(f);
    assert.equal(result.temporaryHomesRemoved, false); assert(fs.existsSync(f.home));
    assert.match(result.homes[0].reason, /still exists/);
  } finally { patch.mock.restore(); syncBuiltinESMExports(); }
});

test("a filesystem removal error is retained and persistence is still attempted", posix, async (t) => {
  const f = await fixture(t, 0); let persisted = false;
  const patch = mock.method(fs, "rmSync", () => { throw new Error("removal denied"); }); syncBuiltinESMExports();
  try {
    const result = await clean(f, { persist: () => { persisted = true; } });
    assert.equal(result.confirmed, false); assert.match(result.homes[0].reason, /removal denied/);
    assert.equal(persisted, true); assert(fs.existsSync(f.home));
  } finally { patch.mock.restore(); syncBuiltinESMExports(); }
});

test("receipt persistence failure is returned explicitly after measured cleanup", posix, async (t) => {
  const f = await fixture(t, 0);
  const result = await clean(f, { persist: () => { throw new Error("receipt denied"); } });
  assert.equal(result.confirmed, false); assert.equal(result.temporaryHomesRemoved, true);
  assert.match(result.errors[0], /Receipt persistence: receipt denied/);
});

test("a rejected/unknown partial startup never fabricates owners or removes HOME", posix, async (t) => {
  const f = await fixture(t, 0); let persisted;
  const result = await clean(f, { startupUncertain: true, persist: (value) => { persisted = structuredClone(value); } });
  assert.equal(result.confirmed, false); assert.deepEqual(result.owners, []);
  assert.equal(result.isolatedServerStopped, false); assert.equal(result.isolatedDesktopStopped, null);
  assert.equal(result.nativeBrowserStopped, null); assert.equal(persisted.startupUncertain, true); assert(fs.existsSync(f.home));
});

test("the actual recipe cleanup tail preserves its workflow error despite closer and persistence failures", posix, async (t) => {
  const f = await fixture(t, 0), original = new Error("original acceptance failure"), receipt = { passed: false };
  const source = fs.readFileSync(new URL("../verify-browser-report.ts", import.meta.url), "utf8");
  const marker = "\n} finally {\n", offset = source.lastIndexOf(marker);
  assert(offset > 0);
  const block = stripTypeScriptTypes("let cleanup; try {} finally {\n" + source.slice(offset + marker.length));
  const run = new (Object.getPrototypeOf(async function () {}).constructor)("cleanupBrowserReport", "owners", "homes", "browserUsed", "prepareBrowserClose",
    "ui", "runtime", "startupUncertain", "persist", "receipt", "stop", "output", "failed", "originalError", "process", "console", "join", "assert", block);
  const stop = () => {}; process.once("SIGINT", stop); process.once("SIGTERM", stop);
  await assert.rejects(run(cleanupBrowserReport, f.owners, f.homes, false, undefined, undefined,
    { closeAll: async () => { throw new Error("RPC failure"); } }, false, () => { throw new Error("persist failure"); }, receipt, stop,
    f.home, true, original, process, { log() {} }, path.join, assert), (error) => error === original);
  assert.equal(process.listeners("SIGINT").includes(stop), false); assert.equal(process.listeners("SIGTERM").includes(stop), false);
  assert.equal(receipt.passed, false); assert.equal(receipt.cleanup.confirmed, false);
  assert(receipt.cleanup.errors.some((error) => error.includes("RPC failure")));
  assert(receipt.cleanup.errors.some((error) => error.includes("persist failure")));
});

test("the actual recipe records a launcher rejection before any returned fixture identity exists", posix, async (t) => {
  const f = await fixture(t, 0), original = new Error("synthetic launcher rejected");
  const source = fs.readFileSync(new URL("../verify-browser-report.ts", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("const root = "))
    .replace('const root = fileURLToPath(new URL("..", import.meta.url));', "const root = testRoot;")
    .replaceAll("import.meta.url", "testModuleUrl");
  const run = new (Object.getPrototypeOf(async function () {}).constructor)("testRoot", "testModuleUrl", "assert", "process", "join", "mkdirSync", "mkdtempSync",
    "randomUUID", "BrowserRuntime", "writeFileSync", "recordReportHome", "launchVerificationServer", "cleanupBrowserReport", "signalReportOwner", "console", stripTypeScriptTypes(body));
  const syntheticProcess = { env: { OMB_VERIFY_BROWSER_BINARY: "/inert/not-launched", OMB_VERIFY_BROWSER_CHROME: "/inert/not-launched" },
    once: process.once.bind(process), off: process.off.bind(process) };
  const beforeInt = process.listeners("SIGINT"), beforeTerm = process.listeners("SIGTERM");
  await assert.rejects(run(f.home, import.meta.url, assert, syntheticProcess, path.join, fs.mkdirSync, fs.mkdtempSync, randomUUID,
    class { async closeAll() {} }, fs.writeFileSync, (ledger, label, location) => { f.addRoot(location); return recordReportHome(ledger, label, location); },
    async () => { throw original; }, cleanupBrowserReport, signalReportOwner, { log() {} }), (error) => error === original);
  const outputs = fs.readdirSync(path.join(f.home, ".local")); assert.equal(outputs.length, 1);
  const receipt = JSON.parse(fs.readFileSync(path.join(f.home, ".local", outputs[0], "receipt.json"), "utf8"));
  assert.equal(receipt.error, original.message); assert.equal(receipt.passed, false);
  assert.equal(receipt.cleanup.startupUncertain, true); assert.deepEqual(receipt.cleanup.owners, []);
  assert.equal(receipt.cleanup.isolatedServerStopped, false); assert.equal(receipt.cleanup.temporaryHomesRemoved, false);
  assert.equal(receipt.cleanup.homes.length, 1); assert(fs.existsSync(receipt.cleanup.homes[0].path));
  assert.deepEqual(process.listeners("SIGINT"), beforeInt); assert.deepEqual(process.listeners("SIGTERM"), beforeTerm);
});
