// GrokOff: exact process identity and disposable-home cleanup for PDF acceptance.
// No process is adopted or signalled merely because its command mentions a path.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function reportPdfProcessIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid owned PID");
  try { return execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart=", "-o", "command="], { encoding: "utf8" }).trim(); }
  catch (error) { if (error.status === 1) return null; throw error; }
}
export function reportPdfProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}
export function stopReportPdfChild(child, identity) {
  if (!child?.pid || !reportPdfProcessAlive(child.pid)) return "gone";
  if (!identity || reportPdfProcessIdentity(child.pid) !== identity) return "unproven";
  child.kill("SIGTERM");
  return "signalled";
}
export function finishReportPdfHome(home, token, pids, unprovenOwner) {
  if (path.dirname(home) !== "/tmp" || !path.basename(home).startsWith("grokoff-report-pdf-") ||
    !fs.lstatSync(home).isDirectory() || fs.lstatSync(home).isSymbolicLink() ||
    !fs.lstatSync(path.join(home, "owner-token")).isFile() || fs.lstatSync(path.join(home, "owner-token")).isSymbolicLink() ||
    fs.readFileSync(path.join(home, "owner-token"), "utf8") !== token) throw new Error("Disposable home ownership was not proven");
  const canonical = fs.realpathSync(home);
  const stillAlive = pids.filter(reportPdfProcessAlive);
  const matchingProcesses = execFileSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8" })
    .split("\n").filter((line) => line.includes(home) || line.includes(canonical));
  const cleanup = { stoppedPids: pids.filter((pid) => !reportPdfProcessAlive(pid)), stillAlive, matchingProcesses, homeRemoved: false };
  if (!stillAlive.length && !matchingProcesses.length && !unprovenOwner) {
    fs.rmSync(home, { recursive: true, force: true }); cleanup.homeRemoved = !fs.existsSync(home);
  } else cleanup.retainedHome = home;
  return cleanup;
}
