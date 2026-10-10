// GrokOff modification (2026-10-10): measured cleanup for the isolated report recipe.
// Importing this module creates no fixture. Path matches veto deletion; they never authorize signals.
import { execFileSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type ReportOwner = { label: string; child: ChildProcess; pid?: number; identity?: string; uncertainty?: string };
export type ReportHome = { label: string; path: string; canonical?: string; dev?: number; ino?: number;
  marker?: { path: string; dev: number; ino: number; token: string }; uncertainty?: string };
export type OwnerExit = { label: string; pid?: number; gone: boolean; uncertainty?: string };
export type HomeExit = { label: string; path: string; removed: boolean; reason?: string; references?: string[] };
export type ReportCleanup = { confirmed: boolean; owners: OwnerExit[]; homes: HomeExit[];
  nativeBrowserStopped: boolean | null; isolatedServerStopped: boolean | null; isolatedDesktopStopped: boolean | null;
  temporaryHomesRemoved: boolean; errors: string[]; startupUncertain: boolean; processScope: string };

export function reportProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid owned PID");
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}

export function reportProcessIdentity(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid owned PID");
  try {
    const output = execFileSync("/bin/ps", ["-p", String(pid), "-o", "pid=,ppid=,pgid=,lstart=,command="],
      { encoding: "utf8", timeout: 2_000, env: { LC_ALL: "C", PATH: "/usr/bin:/bin" } }).trim();
    const row = /^(\d+)\s+(\d+)\s+(\d+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/.exec(output);
    if (!row || Number(row[1]) !== pid) throw new Error("Malformed owned process observation");
    return JSON.stringify({ pid, ppid: Number(row[2]), pgid: Number(row[3]), start: row[4], command: row[5] });
  } catch (error) {
    if ((error as { status?: number }).status !== 1) throw error;
  }
  if (reportProcessAlive(pid)) throw new Error(`Live owned PID ${pid} missing from process observation`);
  return null;
}

/** Record the numeric PID before observing it; a failed observation cannot erase a spawned owner. */
export function recordReportOwner(ledger: ReportOwner[], label: string, child: ChildProcess): ReportOwner {
  const owner: ReportOwner = { label, child, pid: child.pid };
  ledger.push(owner);
  try {
    if (!owner.pid) throw new Error("Spawn supplied no numeric PID");
    owner.identity = reportProcessIdentity(owner.pid) ?? undefined;
    if (owner.identity && JSON.parse(owner.identity).ppid !== process.pid) throw new Error("Spawned process is not a current direct child");
  } catch (error) { owner.uncertainty = message(error); }
  return owner;
}

/** Every signal, including a timer/escalation, rechecks the original birth and command. */
export function signalReportOwner(owner: ReportOwner, signal: NodeJS.Signals = "SIGTERM"): void {
  try {
    if (!owner.pid || owner.child.pid !== owner.pid) throw new Error("Owned PID was not retained");
    if (!reportProcessAlive(owner.pid)) return;
    if (owner.uncertainty || !owner.identity) throw new Error("Owned process identity is unproven; no signal sent");
    const currentIdentity = reportProcessIdentity(owner.pid);
    if (currentIdentity === null) return; // Observation confirmed ESRCH after the earlier liveness check.
    if (currentIdentity !== owner.identity) throw new Error("Owned process identity changed; no signal sent");
    owner.child.kill(signal);
  } catch (error) { owner.uncertainty ??= message(error); }
}

/** A returned waiter is not death proof. Only numeric ESRCH confirms this direct owner is gone. */
export async function stopReportOwner(owner: ReportOwner, graceMs = 5_000): Promise<OwnerExit> {
  try {
    if (!owner.pid) throw new Error("Spawn supplied no numeric PID");
    for (const signal of ["SIGTERM", "SIGKILL"] as const) {
      signalReportOwner(owner, signal);
      if (owner.uncertainty) break;
      const deadline = Date.now() + (signal === "SIGTERM" ? graceMs : Math.min(graceMs, 2_000));
      while (reportProcessAlive(owner.pid) && Date.now() < deadline) await pause(25);
      if (!reportProcessAlive(owner.pid)) break;
    }
    return { label: owner.label, pid: owner.pid, gone: !reportProcessAlive(owner.pid), uncertainty: owner.uncertainty };
  } catch (error) {
    owner.uncertainty ??= message(error);
    return { label: owner.label, pid: owner.pid, gone: false, uncertainty: owner.uncertainty };
  }
}

/** Capture a newly allocated recipe root, not a caller-selected personal directory. */
export function recordReportHome(ledger: ReportHome[], label: string, path: string): ReportHome {
  const home: ReportHome = { label, path };
  ledger.push(home);
  try {
    const root = lstatSync(path);
    const canonical = realpathSync(path);
    if (!root.isDirectory() || root.isSymbolicLink() || ![realpathSync(tmpdir()), realpathSync("/tmp")].includes(dirname(canonical)) ||
      !/^(grokoff-report-desktop-|openmausbot-verify-data-|grokoff-report-cleanup-test-)/.test(basename(path)) ||
      (process.getuid && root.uid !== process.getuid())) throw new Error("Disposable root ownership was not proven");
    home.canonical = canonical; home.dev = root.dev; home.ino = root.ino;
    const token = randomUUID();
    const markerPath = join(path, `.grokoff-report-owner-${token}`);
    writeFileSync(markerPath, token, { mode: 0o600, flag: "wx" });
    const marker = lstatSync(markerPath);
    home.marker = { path: markerPath, dev: marker.dev, ino: marker.ino, token };
  } catch (error) { home.uncertainty = message(error); }
  return home;
}

function absent(path: string): boolean {
  try { lstatSync(path); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; }
}

function sameHome(home: ReportHome): boolean {
  if (home.uncertainty || !home.marker || !home.canonical) return false;
  const stat = lstatSync(home.path), marker = lstatSync(home.marker.path);
  return stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === home.dev && stat.ino === home.ino &&
    realpathSync(home.path) === home.canonical && marker.isFile() && !marker.isSymbolicLink() &&
    marker.dev === home.marker.dev && marker.ino === home.marker.ino && readFileSync(home.marker.path, "utf8") === home.marker.token;
}

export function removeReportHome(home: ReportHome, owners: ReportOwner[], safe: boolean): HomeExit {
  const result: HomeExit = { label: home.label, path: home.path, removed: false };
  try {
    if (!safe) throw new Error("Cleanup or startup remains unconfirmed");
    if (!sameHome(home)) throw new Error("Original disposable directory/marker identity changed");
    if (owners.some((owner) => owner.uncertainty || !owner.pid || reportProcessAlive(owner.pid))) throw new Error("Owned process exit remains unconfirmed");
    // This is a deletion veto only. It does not adopt or signal any discovered process.
    const references = execFileSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8", timeout: 2_000, maxBuffer: 4 * 1024 * 1024 })
      .split("\n").filter((line) => line.includes(home.path) || line.includes(home.canonical!));
    if (references.length) { result.references = references; throw new Error("A process still references the disposable root"); }
    if (!sameHome(home)) throw new Error("Disposable directory identity changed before removal");
    rmSync(home.path, { recursive: true });
    result.removed = absent(home.path);
    if (!result.removed) throw new Error("Disposable root still exists after removal");
  } catch (error) { result.reason = message(error); }
  return result;
}

/** The report recipe alone supplies these closers. Each is attempted even after another fails. */
export async function cleanupBrowserReport({ owners, homes, browserUsed, prepareBrowserClose, closePreview, closeRpc,
  startupUncertain, persist, stepTimeoutMs = 25_000 }: {
  owners: ReportOwner[]; homes: ReportHome[]; browserUsed: boolean; prepareBrowserClose?: () => () => Promise<boolean>;
  closePreview?: () => Promise<unknown>; closeRpc: () => Promise<unknown>; startupUncertain: boolean;
  persist: (cleanup: ReportCleanup) => void; stepTimeoutMs?: number;
}): Promise<ReportCleanup> {
  const cleanup: ReportCleanup = { confirmed: false, owners: [], homes: [], nativeBrowserStopped: null,
    isolatedServerStopped: null, isolatedDesktopStopped: null, temporaryHomesRemoved: false, errors: [], startupUncertain,
    processScope: "Numeric absence of recorded direct server/desktop children, prepared native-browser Boolean and HOME path-reference veto; not a complete descendant/RPC transport inventory." };
  const attempt = async <T>(label: string, fn: () => T | Promise<T>): Promise<T | undefined> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(fn), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Cleanup step deadline elapsed")), stepTimeoutMs);
      })]);
    } catch (error) { cleanup.errors.push(`${label}: ${message(error)}`); return undefined; }
    finally { clearTimeout(timer); }
  };
  // Capture native sessions before stopping callers can remove their session metadata.
  const closeBrowser = browserUsed ? await attempt("prepare native browser close", () => {
    if (!prepareBrowserClose) throw new Error("Missing native browser cleanup proof");
    return prepareBrowserClose();
  }) : undefined;
  if (closePreview) await attempt("preview close", closePreview);
  for (const owner of owners) cleanup.owners.push(await stopReportOwner(owner));
  await attempt("RPC close", closeRpc); // Returned void is never a transport PID inventory.
  if (browserUsed) {
    cleanup.nativeBrowserStopped = closeBrowser ? await attempt("native browser close", closeBrowser) === true : false;
    if (!cleanup.nativeBrowserStopped) cleanup.errors.push("Native browser exit was not confirmed");
  }
  const safe = !startupUncertain && !cleanup.errors.length && cleanup.owners.every((owner) => owner.gone && !owner.uncertainty);
  for (const home of homes) cleanup.homes.push(removeReportHome(home, owners, safe));
  const servers = cleanup.owners.filter((owner) => owner.label.startsWith("server-"));
  const desktops = cleanup.owners.filter((owner) => owner.label.startsWith("desktop-"));
  cleanup.isolatedServerStopped = startupUncertain ? false : servers.length ? servers.every((owner) => owner.gone && !owner.uncertainty) : null;
  cleanup.isolatedDesktopStopped = desktops.length ? desktops.every((owner) => owner.gone && !owner.uncertainty) : null;
  cleanup.temporaryHomesRemoved = cleanup.homes.every((home) => home.removed);
  cleanup.confirmed = safe && cleanup.temporaryHomesRemoved;
  // Receipt persistence is independent of every closer; its failure cannot replace a workflow error.
  try { persist(cleanup); }
  catch (error) { cleanup.confirmed = false; cleanup.errors.push(`Receipt persistence: ${message(error)}`); }
  return cleanup;
}
