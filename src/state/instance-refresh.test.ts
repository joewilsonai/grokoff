import { afterEach, expect, it, vi } from "vitest";
import { createInstanceRefresh, INSTANCE_REFRESH_TIMEOUT_MS } from "./instance-refresh";

afterEach(() => { vi.useRealTimers(); });

it("joins background and explicit checks while reporting failure only to the explicit caller", async () => {
  let reject!: (error: Error) => void;
  const request = vi.fn(() => new Promise<string>((_resolve, fail) => { reject = fail; }));
  const apply = vi.fn();
  const refresh = createInstanceRefresh(request, apply);
  const quiet = refresh.refresh();
  const explicit = refresh.refresh({ reportFailure: true });
  const failure = expect(explicit).rejects.toThrow("unreachable");
  await Promise.resolve();
  expect(request).toHaveBeenCalledOnce();
  reject(new Error("unreachable"));
  await failure;
  await expect(quiet).resolves.toBeUndefined();
  expect(apply).not.toHaveBeenCalled();
});

it("bounds a stalled request, aborts it, retries, and ignores its late result", async () => {
  vi.useFakeTimers();
  let oldResult!: (value: string) => void;
  const request = vi.fn<(signal: AbortSignal) => Promise<string>>()
    .mockImplementationOnce(() => new Promise((resolve) => { oldResult = resolve; }))
    .mockResolvedValueOnce("new account");
  const apply = vi.fn();
  const refresh = createInstanceRefresh(request, apply);
  const pending = refresh.refresh({ reportFailure: true });
  const timedOut = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(INSTANCE_REFRESH_TIMEOUT_MS);
  await timedOut;
  expect(request.mock.calls[0]![0].aborted).toBe(true);
  await refresh.refresh({ reportFailure: true });
  oldResult("old account");
  await Promise.resolve();
  expect(apply.mock.calls).toEqual([["new account"]]);
  expect(vi.getTimerCount()).toBe(0);
});

it("protects a confirmed account mutation from an older inventory response", async () => {
  let answer!: (value: string) => void;
  const apply = vi.fn();
  const refresh = createInstanceRefresh(() => new Promise<string>((resolve) => { answer = resolve; }), apply);
  const check = refresh.refresh();
  await Promise.resolve();
  refresh.cancel();
  await check;
  answer("old signed-in account");
  await Promise.resolve();
  expect(apply).not.toHaveBeenCalled();
});

it("handles synchronous request failures and does not leave the next check blocked", async () => {
  const apply = vi.fn();
  const request = vi.fn<() => Promise<string>>(() => { throw new Error("offline"); });
  const refresh = createInstanceRefresh(request, apply);
  await expect(refresh.refresh({ reportFailure: true })).rejects.toThrow("offline");
  request.mockImplementation(() => Promise.resolve("ready"));
  await refresh.refresh({ reportFailure: true });
  expect(apply).toHaveBeenCalledWith("ready");
});

it("starts a fresh post-mutation request instead of joining an older probe", async () => {
  let oldResult!: (value: string) => void;
  const request = vi.fn<(signal: AbortSignal) => Promise<string>>()
    .mockImplementationOnce(() => new Promise((resolve) => { oldResult = resolve; }))
    .mockResolvedValueOnce("saved account");
  const apply = vi.fn();
  const refresh = createInstanceRefresh(request, apply);
  const background = refresh.refresh();
  await Promise.resolve();
  await refresh.refresh({ fresh: true });
  await background;
  oldResult("old account");
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0]![0].aborted).toBe(true);
  expect(apply.mock.calls).toEqual([["saved account"]]);
});

for (const succeeds of [true, false]) {
  it(`lets a superseded explicit check follow its quiet replacement's ${succeeds ? "success" : "failure"}`, async () => {
    vi.useFakeTimers();
    let resolveNew!: (value: string) => void;
    let rejectNew!: (error: Error) => void;
    const request = vi.fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted old fetch")));
      }))
      .mockImplementationOnce(() => new Promise((resolve, reject) => { resolveNew = resolve; rejectNew = reject; }));
    const apply = vi.fn();
    const refresh = createInstanceRefresh(request, apply);
    let oldSettled = false;
    const old = refresh.refresh({ reportFailure: true }).then(() => { oldSettled = true; }, (error: unknown) => { oldSettled = true; return error; });
    await Promise.resolve();
    const replacement = refresh.refresh({ fresh: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls[0]![0].aborted).toBe(true);
    expect(oldSettled).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    if (succeeds) resolveNew("saved account");
    else rejectNew(new Error("replacement unavailable"));
    const outcome = await old;
    await replacement;
    expect(outcome).toEqual(succeeds ? undefined : new Error("replacement unavailable"));
    expect(apply.mock.calls).toEqual(succeeds ? [["saved account"]] : []);
    expect(vi.getTimerCount()).toBe(0);
  });
}

it("keeps direct cancellation distinct across multiple superseded waiters", async () => {
  vi.useFakeTimers();
  const request = vi.fn<(signal: AbortSignal) => Promise<string>>(() => new Promise(() => {}));
  const apply = vi.fn();
  const refresh = createInstanceRefresh(request, apply);
  const first = refresh.refresh({ reportFailure: true }).catch((error: unknown) => error);
  await Promise.resolve();
  const middle = refresh.refresh({ fresh: true });
  await Promise.resolve();
  const newest = refresh.refresh({ fresh: true, reportFailure: true }).catch((error: unknown) => error);
  await Promise.resolve();
  refresh.cancel();
  expect(await first).toEqual(new Error("Connection check cancelled"));
  expect(await newest).toEqual(new Error("Connection check cancelled"));
  await middle;
  expect(request.mock.calls.every(([signal]) => signal.aborted)).toBe(true);
  expect(apply).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("applies authoritative inventory before resolving obsolete and superseded checks", async () => {
  vi.useFakeTimers();
  const request = vi.fn<(signal: AbortSignal) => Promise<string>>((signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted old fetch")));
  }));
  const apply = vi.fn();
  const refresh = createInstanceRefresh(request, apply);
  const older = refresh.refresh({ reportFailure: true });
  await Promise.resolve();
  const newest = refresh.refresh({ fresh: true, reportFailure: true });
  await Promise.resolve();
  refresh.accept("confirmed account");
  await Promise.all([older, newest]);
  expect(apply.mock.calls).toEqual([["confirmed account"]]);
  expect(request.mock.calls.every(([signal]) => signal.aborted)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
