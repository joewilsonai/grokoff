/** One bounded inventory check shared by explicit checks and quiet background
 * probes. Joining an in-flight check avoids running provider CLI probes twice
 * when the window gains focus as someone clicks Check account. */
export const INSTANCE_REFRESH_TIMEOUT_MS = 10_000;
/** Model discovery may use a 15-second provider request plus a fallback. */
export const MODEL_REFRESH_TIMEOUT_MS = 30_000;
export type InstanceRefreshOptions = { reportFailure?: boolean; fresh?: boolean };

export function createInstanceRefresh<T>(
  request: (signal: AbortSignal) => Promise<T>,
  apply: (result: T) => void,
  timeoutMs = INSTANCE_REFRESH_TIMEOUT_MS,
  timeoutMessage = "Connection check timed out",
) {
  let current: { promise: Promise<void>; cancel: () => void; confirm: () => void; supersede: (replacement: Promise<void>) => void } | null = null;

  const run = (): Promise<void> => {
    if (current) return current.promise;
    const controller = new AbortController();
    let active = true;
    let resolveCheck!: () => void;
    let rejectCheck!: (error: Error) => void;
    let timer: ReturnType<typeof setTimeout>;
    const flight = {
      promise: new Promise<void>((resolve, reject) => {
        resolveCheck = resolve;
        rejectCheck = reject;
        timer = setTimeout(() => {
          active = false;
          controller.abort();
          reject(new Error(timeoutMessage));
        }, timeoutMs);
        // The promise boundary also catches a synchronously throwing request.
        void Promise.resolve().then(() => request(controller.signal)).then((result) => {
          if (!active || current !== flight || controller.signal.aborted) return;
          apply(result);
          active = false;
          resolve();
        }).catch((error) => {
          if (!active) return;
          active = false;
          reject(error);
        });
      }).finally(() => {
        clearTimeout(timer);
        if (current === flight) current = null;
      }),
      cancel: () => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        controller.abort();
        rejectCheck(new Error("Connection check cancelled"));
      },
      confirm: () => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        controller.abort();
        resolveCheck();
      },
      supersede: (replacement: Promise<void>) => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        controller.abort();
        // A confirmed mutation requires a new request. Existing checks
        // follow its actual result instead of showing a cancellation alert.
        void replacement.then(resolveCheck, rejectCheck);
      },
    };
    current = flight;
    return flight.promise;
  };

  const cancel = () => {
    const flight = current;
    current = null;
    flight?.cancel();
  };
  return {
    refresh: (options: InstanceRefreshOptions = {}): Promise<void> => {
      // Successful install/login/save callers require inventory collected
      // after that mutation, rather than joining an older background probe.
      const previous = options.fresh ? current : null;
      if (previous) current = null;
      const check = run();
      previous?.supersede(check);
      // Existing install/save/focus callers deliberately remain quiet. Only
      // an explicit status check needs to surface a failed inventory lookup.
      return options.reportFailure ? check : check.catch(() => {});
    },
    accept: (result: T) => {
      // A successful mutation/discovery response already contains current
      // inventory. Apply it before resolving checks of the obsolete GET.
      apply(result);
      const flight = current;
      current = null;
      flight?.confirm();
    },
    cancel,
  };
}
