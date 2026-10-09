// GrokOff: real disposable subprocess controls for the acceptance cleanup path.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { reportPdfProcessIdentity, reportPdfProcessAlive, stopReportPdfChild, finishReportPdfHome } from "./report-pdf-owners.mjs";

async function fixture(t) {
  const home = fs.mkdtempSync("/tmp/grokoff-report-pdf-control-"); fs.chmodSync(home, 0o700);
  const token = randomUUID(); fs.writeFileSync(path.join(home, "owner-token"), token, { mode: 0o600 });
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", home], { stdio: "ignore" });
  const exited = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  await new Promise((resolve) => child.once("spawn", resolve));
  const identity = reportPdfProcessIdentity(child.pid); assert(identity?.includes(home));
  t.after(async () => {
    if (reportPdfProcessAlive(child.pid)) { assert.equal(stopReportPdfChild(child, identity), "signalled"); await exited; }
    assert(!reportPdfProcessAlive(child.pid)); fs.rmSync(home, { recursive: true, force: true });
  });
  return { home, token, child, exited, identity };
}

test("changed/missing ownership never signals the child or deletes its home", { skip: process.platform === "win32" }, async (t) => {
  const f = await fixture(t);
  assert.equal(stopReportPdfChild(f.child, null), "unproven");
  assert.equal(stopReportPdfChild(f.child, f.identity + "changed"), "unproven");
  assert.equal(f.child.killed, false); assert(reportPdfProcessAlive(f.child.pid));
  assert.equal(finishReportPdfHome(f.home, f.token, [f.child.pid], f.child.pid).homeRemoved, false);
  assert.equal(stopReportPdfChild(f.child, f.identity), "signalled"); await f.exited;
  const cleanup = finishReportPdfHome(f.home, f.token, [f.child.pid], undefined);
  assert.equal(cleanup.homeRemoved, true); assert.deepEqual(cleanup.stillAlive, []);
});

test("an unregistered late child retains HOME without being signalled", { skip: process.platform === "win32" }, async (t) => {
  const f = await fixture(t);
  const retained = finishReportPdfHome(f.home, f.token, [], undefined);
  assert.equal(retained.homeRemoved, false); assert.equal(f.child.killed, false);
  assert(retained.matchingProcesses.some((line) => line.includes(String(f.child.pid)) && line.includes(f.home)));
  assert.equal(stopReportPdfChild(f.child, f.identity), "signalled"); await f.exited;
  assert.equal(finishReportPdfHome(f.home, f.token, [f.child.pid], undefined).homeRemoved, true);
});

test("a wrong owner token refuses removal after the exact child exits", { skip: process.platform === "win32" }, async (t) => {
  const f = await fixture(t);
  assert.equal(stopReportPdfChild(f.child, f.identity), "signalled"); await f.exited;
  assert.throws(() => finishReportPdfHome(f.home, "wrong-owner", [f.child.pid], undefined), /ownership was not proven/);
  assert(fs.existsSync(f.home));
  assert.equal(finishReportPdfHome(f.home, f.token, [f.child.pid], undefined).homeRemoved, true);
});
