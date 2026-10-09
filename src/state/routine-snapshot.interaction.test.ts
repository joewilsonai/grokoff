// @vitest-environment happy-dom
// GrokOff regression: actual StoreProvider with sealed in-memory HTTP/SSE.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore, type AppState, type BotAnnouncement } from "./store";
import type { Routine, RoutineRun } from "@/lib/routines";

const DEADLINE = 30_000;
const bot: BotAnnouncement = {
  id: "fixture-bot", threadId: "fixture-thread", name: "Fixture", title: "", description: "",
  color: "green", notifications: true, unread: false, busy: false, messages: [],
  modelSelection: { instanceId: "fake", model: "fake" },
  tasks: [{ threadId: "fixture-thread", title: "Synthetic chat", createdAt: 1, approvalMode: "ask" }],
};
const routine: Routine = {
  id: "fixture-routine", name: "Fixture routine", prompt: "Offline only", botId: bot.id,
  target: "bot", runOn: "maus", schedule: { type: "interval", everyMinutes: 60, anchorAt: 1 },
  enabled: true, durationMinutes: 5, nextRunAt: 3_600_001, createdAt: 1, updatedAt: 1,
};
const run: RoutineRun = {
  id: "fixture-run", routineId: routine.id, routineName: routine.name, botId: bot.id,
  target: "bot", runOn: "maus", scheduledFor: 1, createdAt: 1, finishedAt: 2,
  status: "completed", manual: true, output: "Saved synthetic result",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
class FixtureEvents {
  static opened: FixtureEvents[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) { FixtureEvents.opened.push(this); }
  close() { this.closed = true; }
  send(frame: object) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
type Read = { signal: AbortSignal | null | undefined };
let reads: Read[];
let respond: (read: Read, index: number) => Promise<Response>;
let state: AppState;
let root: Root | undefined;
let host: HTMLElement | undefined;
let warnings: ReturnType<typeof vi.spyOn>;
const currentStream = () => FixtureEvents.opened.at(-1)!;
async function flush() { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); }
async function send(frame: object) { await act(async () => currentStream().send(frame)); await flush(); }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTimeAsync(ms)); await flush(); }
async function mount() {
  function Probe() { state = useStore().state; return null; }
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(StoreProvider, null, createElement(Probe))));
  await send({ kind: "hello", resumed: false, cursor: "fixture:0" });
}
async function reconnect() {
  await act(async () => currentStream().onerror?.());
  await advance(500);
  await send({ kind: "hello", resumed: false, cursor: "fixture:10" });
}
async function queuedUpdates() {
  await send({ kind: "bot", bot: { ...bot, busy: true } });
  await send({ kind: "message", threadId: bot.threadId, message: {
    id: "fixture-reply", role: "bot", kind: "text", text: "Queued ordinary reply", at: 3,
  } });
  await send({ kind: "routine.run", run: { ...run, output: "Current terminal result" } });
}
function expectReleased() {
  expect(state.bots[0]?.busy).toBe(true);
  expect(state.bots[0]?.messages.some((message) => message.id === "fixture-reply")).toBe(true);
  expect(state.routineRuns.find((item) => item.id === run.id)?.output).toBe("Current terminal result");
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", FixtureEvents); FixtureEvents.opened = []; reads = [];
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  respond = async () => json({ routines: [], runs: [] });
  vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => {
    const path = String(input);
    if (path.startsWith("/api/bots?")) return Promise.resolve(json({ bots: [bot], groups: [] }));
    if (path === "/api/routines") {
      const read = { signal: init?.signal }; reads.push(read); return respond(read, reads.length - 1);
    }
    if (path === "/api/instances") return Promise.resolve(json({ instances: [] }));
    if (path === "/api/config") return Promise.resolve(json({}));
    if (path === "/api/webhooks") return Promise.resolve(json({ webhooks: [], attempts: [], ingress: [] }));
    if (path === "/api/live/call") return Promise.resolve(json({ call: null }));
    throw new Error(`Unapproved fixture transport: ${path}`);
  }));
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; host?.remove(); host = undefined;
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("routine snapshot hydration recovery", () => {
  it("aborts held headers at 30s, releases ordinary and routine frames, then retries", async () => {
    const held = deferred<Response>(); respond = async (_read, index) => index === 0 ? held.promise : json({ routines: [routine], runs: [run] });
    await mount(); await queuedUpdates();
    await advance(DEADLINE - 1);
    expect(state.routinesLoadState).toBe("loading"); expect(state.bots[0]?.busy).toBe(false);
    await advance(1);
    expect(reads[0]?.signal?.aborted).toBe(true); expect(state.routinesLoadState).toBe("error"); expectReleased();
    expect(reads).toHaveLength(1);
    await advance(1_000);
    expect(reads).toHaveLength(2); expect(state.routinesLoadState).toBe("ready");
    // A transport that ignores abort must not apply its eventual old response.
    held.resolve(json({ routines: [], runs: [] })); await flush();
    expect(state.routines).toEqual([routine]); expect(state.routineRuns).toEqual([run]);
  });

  it("uses one deadline for delayed headers plus a held real response body", async () => {
    const headers = deferred<Response>(); let body!: ReadableStreamDefaultController<Uint8Array>; let bodyAborts = 0;
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
      body = controller; controller.enqueue(new TextEncoder().encode('{"routines":['));
    } }));
    respond = async (read, index) => {
      if (index !== 0) return json({ routines: [], runs: [] });
      read.signal?.addEventListener("abort", () => { bodyAborts++; body.error(read.signal!.reason); }, { once: true });
      return headers.promise;
    };
    await mount(); await queuedUpdates(); await advance(20_000);
    headers.resolve(response); await flush();
    await advance(9_999); expect(state.routinesLoadState).toBe("loading");
    await advance(1);
    expect(bodyAborts).toBe(1); expect(reads[0]?.signal?.aborted).toBe(true);
    expect(state.routinesLoadState).toBe("error"); expectReleased();
  });

  it("retains history on failed reconnect and rejects a retry older than a live result", async () => {
    const reconnectRead = deferred<Response>(); const retry = deferred<Response>();
    respond = async (_read, index) => index === 0 ? json({ routines: [routine], runs: [run] }) : index === 1 ? reconnectRead.promise : index === 2 ? retry.promise : json({ routines: [routine], runs: [{ ...run, output: "Newest live result" }] });
    await mount(); expect(state.routineRuns).toEqual([run]);
    await reconnect(); await queuedUpdates(); await advance(DEADLINE);
    expect(reads[1]?.signal?.aborted).toBe(true); expect(state.routines).toEqual([routine]); expectReleased();
    await advance(1_000); expect(reads).toHaveLength(3);
    await send({ kind: "routine.run", run: { ...run, output: "Newest live result" } });
    retry.resolve(json({ routines: [], runs: [run] })); await flush();
    expect(state.routineRuns[0]?.output).toBe("Newest live result"); expect(state.routines).toEqual([routine]);
    expect(state.routinesLoadState).toBe("error");
    await advance(2_000);
    expect(reads).toHaveLength(4); expect(state.routinesLoadState).toBe("ready");
    reconnectRead.resolve(json({ routines: [], runs: [] })); await flush();
    expect(state.routineRuns[0]?.output).toBe("Newest live result");
  });

  it.each([
    ["HTTP refusal", () => json({ error: "Synthetic unavailable" }, 503)],
    ["malformed JSON", () => new Response("{bad")],
    ["missing arrays", () => json({ routines: [] })],
    ["null JSON", () => json(null)],
  ])("releases hydration and retries after %s without replacing valid history", async (_label, fail) => {
    respond = async (_read, index) => index === 0 ? json({ routines: [routine], runs: [run] }) : index === 1 ? fail() : json({ routines: [routine], runs: [run] });
    await mount(); await reconnect();
    expect(state.routinesLoadState).toBe("error"); expect(state.routines).toEqual([routine]); expect(state.routineRuns).toEqual([run]);
    await send({ kind: "bot", bot: { ...bot, busy: true } }); expect(state.bots[0]?.busy).toBe(true);
    await advance(1_000); expect(state.routinesLoadState).toBe("ready");
    expect(warnings).toHaveBeenCalledTimes(1);
  });

  it("clears a successful request deadline without a phantom retry", async () => {
    respond = async () => json({ routines: [routine], runs: [run] });
    await mount(); await advance(DEADLINE);
    expect(state.routinesLoadState).toBe("ready"); expect(reads).toHaveLength(1);
    expect(reads[0]?.signal?.aborted).toBe(false); expect(warnings).not.toHaveBeenCalled();
  });

  it("quietly aborts an outstanding routine read on Store unmount", async () => {
    const held = deferred<Response>(); respond = () => held.promise;
    await mount(); await act(async () => root!.unmount()); root = undefined; await flush();
    expect(reads[0]?.signal?.aborted).toBe(true);
    await advance(DEADLINE + 2_000); expect(reads).toHaveLength(1); expect(warnings).not.toHaveBeenCalled();
    held.resolve(json({ routines: [], runs: [] })); await flush();
  });
});
