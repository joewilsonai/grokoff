// @vitest-environment happy-dom
// GrokOff: real StoreProvider, virtual clocks and sealed in-memory HTTP/SSE.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore, type AppState, type BotAnnouncement, type ConfigStatus } from "./store";
import type { WebhookAttempt, WebhookTrigger } from "@/lib/webhooks";

const DEADLINE = 30_000;
const bot: BotAnnouncement = {
  id: "fixture-bot", threadId: "fixture-thread", name: "Fixture", title: "", description: "",
  color: "green", notifications: true, unread: false, busy: false, messages: [],
  modelSelection: { instanceId: "fake", model: "fake" },
  tasks: [{ threadId: "fixture-thread", title: "Synthetic chat", createdAt: 1, approvalMode: "ask" }],
};
const settings: ConfigStatus = {
  composio: { configured: false }, box: { configured: false }, vps: { configured: false, sshAlias: "" },
  rooms: { turnTimeoutMinutes: 10 }, localVm: { mode: "per-bot", maxInstances: 2 }, language: "en",
};
const hook: WebhookTrigger = {
  id: "fixture-hook", endpointId: "fixture-endpoint", name: "Fixture webhook", prompt: "Offline only",
  botId: bot.id, runOn: "maus", enabled: true, createdAt: 1, updatedAt: 1, deliveryCount: 1,
};
const attempt: WebhookAttempt = { id: "fixture-attempt", webhookId: hook.id, receivedAt: 2, outcome: "accepted", statusCode: 202 };
const ingress = { available: true, baseUrl: "http://127.0.0.1:1" };
type Endpoint = "/api/config" | "/api/webhooks";
const snapshot = (endpoint: Endpoint, current = false) => endpoint === "/api/config"
  ? { ...settings, language: current ? "fr" : "en" }
  : { webhooks: [{ ...hook, name: current ? "Current webhook" : hook.name }], attempts: [attempt], ingress };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
class Events {
  static opened: Events[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) { Events.opened.push(this); }
  close() { this.closed = true; }
  send(frame: object) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
type Read = { signal: AbortSignal | null | undefined };
let endpoint: Endpoint;
let reads: Read[];
let respond: (read: Read, index: number) => Promise<Response>;
let state: AppState;
let root: Root | undefined;
let host: HTMLElement | undefined;
let warnings: ReturnType<typeof vi.spyOn>;
const stream = () => Events.opened.at(-1)!;
async function flush() { await act(async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); }); }
async function send(frame: object) { await act(async () => stream().send(frame)); await flush(); }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTimeAsync(ms)); await flush(); }
async function mount() {
  function Probe() { state = useStore().state; return null; }
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(StoreProvider, null, createElement(Probe))));
  await send({ kind: "hello", resumed: false, cursor: "fixture:0" });
}
async function reconnect() {
  await act(async () => stream().onerror?.()); await advance(500);
  await send({ kind: "hello", resumed: false, cursor: "fixture:10" });
}
async function queuedUpdates() {
  await send({ kind: "bot", bot: { ...bot, busy: true } });
  await send({ kind: "message", threadId: bot.threadId, message: { id: "fixture-reply", role: "bot", kind: "text", text: "Queued reply", at: 3 } });
  await send({ kind: "routine.run", run: { id: "fixture-run", routineId: "fixture-routine", routineName: "Fixture", botId: bot.id,
    target: "bot", runOn: "maus", scheduledFor: 1, createdAt: 1, finishedAt: 2, status: "completed", manual: true, output: "Current result" } });
}
function expectReleased() {
  expect(state.bots[0]?.busy).toBe(true);
  expect(state.bots[0]?.messages.some(message => message.id === "fixture-reply")).toBe(true);
  expect(state.routineRuns[0]?.output).toBe("Current result");
}
function expectPanel(current = false) {
  if (endpoint === "/api/config") expect(state.config?.language).toBe(current ? "fr" : "en");
  else { expect(state.webhooks).toEqual([{ ...hook, name: current ? "Current webhook" : hook.name }]); expect(state.webhookAttempts).toEqual([attempt]); expect(state.webhookIngress).toEqual(ingress); }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("EventSource", Events);
  Events.opened = []; reads = []; warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  respond = async () => json(snapshot(endpoint));
  vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => {
    const path = String(input);
    if (path === endpoint) { const read = { signal: init?.signal }; reads.push(read); return respond(read, reads.length - 1); }
    if (path.startsWith("/api/bots?")) return Promise.resolve(json({ bots: [bot], groups: [] }));
    if (path === "/api/routines") return Promise.resolve(json({ routines: [], runs: [] }));
    if (path === "/api/instances") return Promise.resolve(json({ instances: [] }));
    if (path === "/api/config" || path === "/api/webhooks") return Promise.resolve(json(snapshot(path)));
    if (path === "/api/live/call") return Promise.resolve(json({ call: null }));
    throw new Error(`Unapproved fixture transport: ${path}`);
  }));
});

describe("optional snapshot envelope compatibility", () => {
  beforeEach(() => { endpoint = "/api/webhooks"; });
  it.each([
    ["missing webhook list", { attempts: [], ingress }],
    ["invalid attempt list", { webhooks: [], attempts: null, ingress }],
    ["invalid ingress availability", { webhooks: [], attempts: [], ingress: { ...ingress, available: "true" } }],
    ["missing ingress", { webhooks: [], attempts: [] }],
  ])("rejects %s without erasing existing history, then recovers", async (_label, invalid) => {
    respond = async (_read, index) => index === 1 ? json(invalid) : json(snapshot(endpoint));
    await mount(); await reconnect(); expectPanel(); expect(warnings).toHaveBeenCalledTimes(1);
    await queuedUpdates(); expectReleased(); await advance(1_000); expectPanel(); expect(reads).toHaveLength(3);
  });
  it("retains the existing empty-attempt default for a valid older envelope", async () => {
    respond = async () => json({ webhooks: [hook], ingress }); await mount();
    expect(state.webhooks).toEqual([hook]); expect(state.webhookAttempts).toEqual([]); expect(state.webhookIngress).toEqual(ingress);
    expect(warnings).not.toHaveBeenCalled();
  });
  it("rejects an error envelope with successful HTTP status without replacing config", async () => {
    endpoint = "/api/config"; respond = async (_read, index) => json(index === 1 ? { error: "Synthetic invalid snapshot" } : settings);
    await mount(); await reconnect(); expectPanel(); expect(warnings).toHaveBeenCalledTimes(1);
    await queuedUpdates(); expectReleased(); await advance(1_000); expectPanel();
  });
  it("accepts sparse config sections from older servers without introducing a new schema", async () => {
    endpoint = "/api/config"; respond = async () => json({ language: "en" }); await mount();
    expect(state.config).toEqual({ language: "en" }); expect(warnings).not.toHaveBeenCalled();
  });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); host = undefined;
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe.each(["/api/config", "/api/webhooks"] as const)("optional %s hydration recovery", (path) => {
  beforeEach(() => { endpoint = path; });
  it("aborts held headers at 30s, releases chat/run updates, retries and ignores the late response", async () => {
    const held = deferred<Response>(); respond = async (_read, index) => index === 0 ? held.promise : json(snapshot(endpoint, true));
    await mount(); await queuedUpdates(); await advance(DEADLINE - 1);
    expect(state.bots[0]?.busy).toBe(false); await advance(1);
    expect(reads[0]?.signal?.aborted).toBe(true); expect(warnings).toHaveBeenCalledTimes(1); expectReleased();
    await advance(1_000); expect(reads).toHaveLength(2); expectPanel(true);
    held.resolve(json(snapshot(endpoint))); await flush(); expectPanel(true);
  });
  it("bounds delayed headers plus a held streaming JSON body with one deadline", async () => {
    const headers = deferred<Response>(); let body!: ReadableStreamDefaultController<Uint8Array>; let aborts = 0;
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; controller.enqueue(new TextEncoder().encode('{"pending":')); } }));
    respond = async (read, index) => {
      if (index !== 0) return json(snapshot(endpoint));
      read.signal?.addEventListener("abort", () => { aborts++; body.error(read.signal!.reason); }, { once: true }); return headers.promise;
    };
    await mount(); await queuedUpdates(); await advance(20_000); headers.resolve(response); await flush();
    await advance(9_999); expect(state.bots[0]?.busy).toBe(false); await advance(1);
    expect(aborts).toBe(1); expect(reads[0]?.signal?.aborted).toBe(true); expect(warnings).toHaveBeenCalledTimes(1); expectReleased();
    await advance(1_000); expectPanel();
  });
  it("retains history on reconnect and discards a background retry overtaken by a live patch", async () => {
    const reconnectRead = deferred<Response>(); const retry = deferred<Response>();
    respond = async (_read, index) => index === 0 ? json(snapshot(endpoint)) : index === 1 ? reconnectRead.promise : index === 2 ? retry.promise : json(snapshot(endpoint, true));
    await mount(); expectPanel(); await reconnect(); await queuedUpdates(); await advance(DEADLINE);
    expectPanel(); expectReleased(); expect(reads[1]?.signal?.aborted).toBe(true);
    await advance(1_000);
    await send(endpoint === "/api/config" ? { kind: "config", ...settings, language: "fr" } : { kind: "webhook", webhook: { ...hook, name: "Current webhook" } });
    expectPanel(true); retry.resolve(json(snapshot(endpoint))); await flush(); expectPanel(true);
    await advance(2_000); expect(reads).toHaveLength(4); expectPanel(true);
    reconnectRead.resolve(json(snapshot(endpoint))); await flush(); expectPanel(true);
  });
  it.each([
    ["HTTP refusal", () => json({ error: "Synthetic unavailable" }, 503)],
    ["malformed JSON", () => new Response("{bad")],
    ["array envelope", () => json([])],
    ["null envelope", () => json(null)],
  ])("retains prior state and resumes chat/retry after %s", async (_label, fail) => {
    respond = async (_read, index) => index === 0 ? json(snapshot(endpoint)) : index === 1 ? fail() : json(snapshot(endpoint));
    await mount(); await reconnect(); expectPanel(); expect(warnings).toHaveBeenCalledTimes(1);
    await queuedUpdates(); expectReleased(); await advance(1_000); expectPanel(); expect(reads).toHaveLength(3);
  });
  it("clears a successful read deadline without a phantom retry", async () => {
    await mount(); await advance(DEADLINE); expectPanel(); expect(reads).toHaveLength(1);
    expect(reads[0]?.signal?.aborted).toBe(false); expect(warnings).not.toHaveBeenCalled();
  });
  it("aborts an outstanding read quietly on unmount without late retry/application", async () => {
    const held = deferred<Response>(); respond = () => held.promise; await mount();
    await act(async () => root!.unmount()); root = undefined; await flush(); expect(reads[0]?.signal?.aborted).toBe(true);
    await advance(DEADLINE + 2_000); held.resolve(json(snapshot(endpoint))); await flush();
    expect(reads).toHaveLength(1); expect(warnings).not.toHaveBeenCalled();
  });
});
