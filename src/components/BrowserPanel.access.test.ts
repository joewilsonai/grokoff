// @vitest-environment happy-dom
// GrokOff regression coverage (2026-10-09): actual React access-check recovery with sealed synthetic transport.
// No server, native browser, user profile, credentials or live provider.
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ api: vi.fn(), engine: { kind: "engine" } as { kind: string; installable?: boolean } }));
vi.mock("@/state/store", () => ({
  api: fixture.api,
  useStore: () => ({ state: { config: { browserEngine: fixture.engine, browserProfiles: [] } } }),
}));
vi.mock("@/components/BrowserProfilesManager", () => ({ BrowserProfilesManager: () => null }));
import { BrowserPanel } from "@/components/BrowserPanel";
import type { Bot } from "@/state/store";

const bot = { id: "synthetic-browser-owner", name: "Synthetic Research", browser: true } as Bot;
let root: Root;
let host: HTMLDivElement;
const sources: Array<{ url: string; close: ReturnType<typeof vi.fn> }> = [];
class OwnedEventSource {
  close = vi.fn();
  constructor(readonly url: string) {
    expect(url).toBe("/api/bots/synthetic-browser-owner/browser/live");
    sources.push(this);
  }
  addEventListener() {}
}
const tick = async () => { await act(async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); }); };
const render = async () => { await act(async () => root.render(createElement(BrowserPanel, { bot }))); await tick(); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", OwnedEventSource);
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Unexpected network in sealed BrowserPanel triage"); }));
  fixture.engine = { kind: "engine" };
  fixture.api.mockReset();
  fixture.api.mockImplementation((url: string) => {
    expect(url).toBe("/api/auth/session");
    return Promise.resolve({ kind: "loopback", scopes: ["admin", "client"] });
  });
  sources.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  expect(sources.every(source => source.close.mock.calls.length > 0)).toBe(true);
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("does not turn a failed access check into a permanent non-admin refusal", async () => {
  fixture.api.mockRejectedValueOnce(Error("Synthetic session503"));
  await render();
  expect(host.textContent).not.toContain("Only admins of this installation");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  const retry = [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Retry");
  expect(retry).toBeDefined();
});

it("retains the permission refusal for a successful non-admin session", async () => {
  fixture.api.mockResolvedValueOnce({ kind: "session", scopes: ["client"] });
  await render();
  expect(host.textContent).toContain("Only admins of this installation");
  expect(fixture.api).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(0);
});

it("opens observation only after a successful admin access check", async () => {
  await render();
  expect(host.textContent).not.toContain("Only admins of this installation");
  expect(fixture.api).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(1);
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const retry = async () => {
  const button = [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Retry");
  expect(button).toBeDefined();
  await act(async () => button!.click());
  await tick();
};

it("recovers on explicit Retry without installing the engine or taking browser control", async () => {
  fixture.api.mockRejectedValueOnce(Error("Synthetic session503"));
  await render();
  expect(sources).toHaveLength(0);
  await retry();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(sources).toHaveLength(1);
  expect(fixture.api.mock.calls.map(([url]) => url)).toEqual(["/api/auth/session", "/api/auth/session"]);
});

it("keeps a successful non-admin result authoritative after Retry", async () => {
  fixture.api.mockRejectedValueOnce(Error("Synthetic session503"));
  await render();
  fixture.api.mockResolvedValueOnce({ scopes: ["client"] });
  await retry();
  expect(host.textContent).toContain("Only admins of this installation");
  expect(host.querySelector("button")).toBeNull();
  expect(sources).toHaveLength(0);
});

it.each([null, {}, { scopes: "admin" }, { scopes: ["admin", 1] }])("fails closed with retry for malformed session %j", async (session) => {
  fixture.api.mockResolvedValueOnce(session);
  await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Only admins of this installation");
  expect(sources).toHaveLength(0);
  await retry();
  expect(sources).toHaveLength(1);
});

it("keeps installation unavailable during access checks and only offers it to a confirmed admin", async () => {
  fixture.engine = { kind: "missing", installable: true };
  const held = deferred<{ scopes: string[] }>();
  fixture.api.mockReturnValueOnce(held.promise);
  await render();
  expect(host.querySelector("button")?.disabled).toBe(true);
  await act(async () => held.resolve({ scopes: ["admin"] }));
  await tick();
  expect(host.textContent).toContain("Install the browser engine");
  expect(fixture.api).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(0);
});

it.each(["resolve", "reject"] as const)("ignores a timed-out check's late %s after Retry", async (late) => {
  vi.useFakeTimers();
  const held = deferred<{ scopes: string[] }>();
  fixture.api.mockReturnValueOnce(held.promise);
  await render();
  const signal = fixture.api.mock.calls[0]![1].signal as AbortSignal;
  await act(async () => vi.advanceTimersByTime(30_000));
  await tick();
  expect(signal.aborted).toBe(true);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("timed out");
  expect(sources).toHaveLength(0);
  fixture.api.mockResolvedValueOnce({ scopes: ["client"] });
  await retry();
  await act(async () => late === "resolve" ? held.resolve({ scopes: ["admin"] }) : held.reject(Error("old check")));
  await tick();
  expect(host.textContent).toContain("Only admins of this installation");
  expect(sources).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["resolve", "reject"] as const)("aborts quietly on unmount and ignores late %s", async (late) => {
  vi.useFakeTimers();
  const held = deferred<{ scopes: string[] }>();
  fixture.api.mockReturnValueOnce(held.promise);
  await render();
  const signal = fixture.api.mock.calls[0]![1].signal as AbortSignal;
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => late === "resolve" ? held.resolve({ scopes: ["admin"] }) : held.reject(Error("old check")));
  await tick();
  expect(host.textContent).toBe("");
  expect(sources).toHaveLength(0);
});

it("preserves a disabled bot's browser setting", async () => {
  await act(async () => root.render(createElement(BrowserPanel, { bot: { ...bot, browser: false } })));
  await tick();
  expect(host.textContent).toContain("Enable the browser in this bot’s profile");
  expect(sources).toHaveLength(0);
});

it.each(["headers", "body"])("bounds actual api transport while %s are held, then recovers", async (phase) => {
  vi.useFakeTimers();
  const { api: actualApi } = await vi.importActual<typeof import("@/state/store")>("@/state/store");
  const heldHeaders = deferred<Response>();
  const heldBody = deferred<{ scopes: string[] }>();
  const fetch = vi.fn((url: string, _init?: RequestInit) => {
    expect(url).toBe("/api/auth/session");
    return phase === "headers" ? heldHeaders.promise : Promise.resolve({ ok: true, json: () => heldBody.promise } as Response);
  });
  vi.stubGlobal("fetch", fetch);
  fixture.api.mockImplementation(actualApi);
  await render();
  const signal = fetch.mock.calls[0]![1]?.signal;
  await act(async () => vi.advanceTimersByTime(30_000));
  await tick();
  expect(signal?.aborted).toBe(true);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("timed out");
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ scopes: ["admin"] }), { status: 200 }));
  await retry();
  expect(sources).toHaveLength(1);
  await act(async () => {
    heldHeaders.resolve(new Response(JSON.stringify({ scopes: ["client"] }), { status: 200 }));
    heldBody.resolve({ scopes: ["client"] });
  });
  await tick();
  expect(sources).toHaveLength(1);
  expect(host.textContent).not.toContain("Only admins of this installation");
});

it("keeps an empty rejection retryable", async () => {
  fixture.api.mockRejectedValueOnce(Error(""));
  await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await retry();
  expect(sources).toHaveLength(1);
});

it("aborts the StrictMode rehearsal and only accepts the current check", async () => {
  const old = deferred<{ scopes: string[] }>();
  fixture.api.mockReturnValueOnce(old.promise);
  await act(async () => root.render(createElement(StrictMode, null, createElement(BrowserPanel, { bot }))));
  await tick();
  expect(fixture.api.mock.calls[0]![1].signal.aborted).toBe(true);
  expect(sources.some(source => source.close.mock.calls.length === 0)).toBe(true);
  await act(async () => old.resolve({ scopes: ["client"] }));
  await tick();
  expect(host.textContent).not.toContain("Only admins of this installation");
});

it("shows a real api503 as a check failure and rechecks instead of installing", async () => {
  const { api: actualApi } = await vi.importActual<typeof import("@/state/store")>("@/state/store");
  const fetch = vi.fn((url: string) => {
    expect(url).toBe("/api/auth/session");
    return Promise.resolve(new Response(JSON.stringify({ error: "Synthetic service unavailable" }), { status: 503 }));
  });
  vi.stubGlobal("fetch", fetch);
  fixture.api.mockImplementation(actualApi);
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Synthetic service unavailable");
  expect(host.textContent).not.toContain("Only admins of this installation");
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ scopes: ["admin"] }), { status: 200 }));
  await retry();
  expect(sources).toHaveLength(1);
});
