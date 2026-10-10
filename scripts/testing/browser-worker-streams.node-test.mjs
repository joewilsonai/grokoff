// Controlled subprocess regression; every process and file belongs to this test.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { boundBrowserWorkerStreamDrain } from "./browser-worker-streams.mjs";

async function stopOwnedDescendant(pid) {
  try { process.kill(pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); }
    catch (error) { if (error.code !== "ESRCH") throw error; return; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail("Owned pipe-holding descendant did not exit.");
}

test("an early worker exit drains inherited pipes before the long worker timeout", { timeout: 10_000 }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "gof-worker-pipes-"));
  const pidFile = join(scratch, "descendant.pid");
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'],
    });
    writeFileSync(process.argv[1], String(descendant.pid), { mode: 0o600 });
    descendant.unref();
    process.exit(0);
  `, pidFile], { cwd: scratch, env: { HOME: scratch, USERPROFILE: scratch }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const started = Date.now();
  const longWorkerTimeout = setTimeout(() => child.kill("SIGTERM"), 5000);
  const closed = once(child, "close");
  let closedAlready = false;
  void closed.then(() => { closedAlready = true; });
  boundBrowserWorkerStreamDrain(child, 300);
  let descendantPid;
  let drainDeadline;
  try {
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
    descendantPid = Number(readFileSync(pidFile, "utf8"));
    assert(Number.isInteger(descendantPid) && descendantPid > 0);
    process.kill(descendantPid, 0);
    assert.equal(closedAlready, false, "The controlled descendant must still retain the worker's pipes.");
    const [closeCode] = await Promise.race([closed, new Promise((_resolve, reject) => {
      drainDeadline = setTimeout(() => reject(new Error("Exited worker's inherited pipes did not drain.")), 2000);
    })]);
    assert.equal(closeCode, 0);
    assert(Date.now() - started < 4500, "Stream drain waited for the long worker timeout.");
    process.kill(descendantPid, 0); // Retiring pipes must not kill an independent daemon.
  } finally {
    clearTimeout(longWorkerTimeout);
    clearTimeout(drainDeadline);
    // These are exact PIDs created by the controlled subprocess, never names
    // or process groups. Keep cleanup independent of a failed assertion.
    if (descendantPid === undefined) {
      try { descendantPid = Number(readFileSync(pidFile, "utf8")); } catch { /* spawn failed before writing */ }
    }
    let cleanupError;
    if (Number.isInteger(descendantPid) && descendantPid > 0) {
      try { await stopOwnedDescendant(descendantPid); } catch (error) { cleanupError = error; }
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    child.stdout?.destroy(); child.stderr?.destroy();
    await closed;
    rmSync(scratch, { recursive: true, force: true });
    assert.ifError(cleanupError);
  }
});
