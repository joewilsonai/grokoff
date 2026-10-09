import type { Routine, RoutineRun } from "@/lib/routines";

/** Optional local history must not hold the chat's hydration boundary forever.
 * One deadline covers both response headers and the complete JSON body. */
export const ROUTINE_SNAPSHOT_TIMEOUT_MS = 30_000;

export async function readRoutineSnapshot(lifetime: AbortSignal): Promise<{ routines: Routine[]; runs: RoutineRun[] }> {
  const deadline = new AbortController();
  const signal = AbortSignal.any([lifetime, deadline.signal]);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => deadline.abort(new Error("Routine history request timed out after 30 seconds")), ROUTINE_SNAPSHOT_TIMEOUT_MS);
  try {
    return await Promise.race([
      aborted,
      (async () => {
        signal.throwIfAborted();
        const response = await fetch("/api/routines", { headers: { "content-type": "application/json" }, signal });
        signal.throwIfAborted();
        // Unlike the general command API, decoding failures are failures of
        // this snapshot: they must reach its existing retry lane, never hydrate
        // missing arrays or erase the last known history.
        const body: unknown = await response.json();
        signal.throwIfAborted();
        if (!response.ok) throw new Error(`Routine history request failed (${response.status})`);
        if (!body || typeof body !== "object" || !("routines" in body) || !("runs" in body) ||
            !Array.isArray(body.routines) || !Array.isArray(body.runs)) {
          throw new Error("Invalid routine history response");
        }
        // The server owns routine record schemas; validate the snapshot
        // envelope before handing its existing wire records to the reducer.
        return body as { routines: Routine[]; runs: RoutineRun[] };
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
