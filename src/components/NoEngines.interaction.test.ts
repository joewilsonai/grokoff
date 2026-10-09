// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoreProvider, useStore, type InstanceInfo } from "@/state/store";
import { INSTANCE_REFRESH_TIMEOUT_MS } from "@/state/instance-refresh";
import { setLocale } from "@/lib/i18n";
import { NoEngines } from "./NoEngines";

// Run the real store, fetch helper, reducer and first-run component. Only the
// SSE boundary and inventory responses are synthetic. Every mutation fails.
vi.mock("@/lib/live-events", async (original) => ({
  ...await original<typeof import("@/lib/live-events")>(),
  openLiveEvents: (handlers: { onSnapshotRequired: () => Promise<boolean> }) => {
    queueMicrotask(() => void handlers.onSnapshotRequired());
    return () => {};
  },
}));

const initial = (): InstanceInfo[] => [
  {
    instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", cliDefault: "claude", access: "subscription",
    snapshot: { state: "unavailable" }, models: { default: "claude-sonnet-5-5", options: [] },
    install: { command: { darwin: "fixture-install-claude" }, signInCommand: "claude auth login" },
  },
  {
    instanceId: "codex", driverKind: "codex", displayName: "Codex", cliDefault: "codex", access: "subscription",
    snapshot: { state: "unavailable" }, models: { default: "gpt-6.1-sol", options: [] },
    install: { command: { darwin: "fixture-install-codex" }, signInCommand: "codex login" },
  },
];
const errorCopy = "Couldn't check your connections. Showing the last known status. Try again.";
let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof useStore>;
let instances: InstanceInfo[];
let mode: "ready" | "failed" | "pending";
let finishPending: ((response: Response) => void) | undefined;
let requests: Array<{ path: string; method: string }>;
let remote: boolean;
const oldBridge = Object.getOwnPropertyDescriptor(window, "ogb");

function Harness() {
  store = useStore();
  return createElement(NoEngines);
}
const button = (label: string) => [...container.querySelectorAll("button")].find((el) => el.textContent?.trim() === label)!;
const warning = () => [...container.querySelectorAll('[role="alert"]')].find((el) => el.textContent === errorCopy);
const tick = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const mount = async (remoteClient: boolean) => {
  remote = remoteClient;
  Object.defineProperty(window, "ogb", { configurable: true, value: { platform: "darwin", remoteClient: { active: remote } } });
  await act(async () => { root.render(createElement(StoreProvider, null, createElement(Harness))); });
  await tick();
  expect(store.state.instances).toEqual(initial());
  expect(container.textContent).toContain(remote ? "The host needs an agent engine" : "Install Claude");
  if (!remote) expect(container.textContent).toContain("Install Codex");
};
const assertInventoryOnly = () => {
  expect(requests.every((request) => request.method === "GET")).toBe(true);
  expect(requests.some((request) => /\/auth\/|\/install$|\/refresh-models$/.test(request.path))).toBe(false);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const preferences = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) });
  setLocale("en");
  instances = initial();
  mode = "ready";
  finishPending = undefined;
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push({ path, method });
    if (method !== "GET") throw new Error(`Mutation rejected in first-run fixture: ${method} ${path}`);
    if (path === "/api/instances") {
      if (mode === "failed") return new Response(JSON.stringify({ error: "Private fixture server detail" }), { status: 503 });
      if (mode === "pending") return new Promise<Response>((resolve) => { finishPending = resolve; });
      return new Response(JSON.stringify({ instances }));
    }
    const bodies: Record<string, unknown> = {
      "/api/bots?messages=200": { bots: [], groups: [], sections: [] }, "/api/config": {},
      "/api/routines": { routines: [], runs: [] }, "/api/webhooks": { webhooks: [] }, "/api/live/call": {},
    };
    if (!Object.hasOwn(bodies, path)) throw new Error(`Unexpected first-run fixture request: ${path}`);
    return new Response(JSON.stringify(bodies[path]));
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (oldBridge) Object.defineProperty(window, "ogb", oldBridge);
  else Reflect.deleteProperty(window, "ogb");
});

for (const remoteClient of [false, true]) {
  const surface = remoteClient ? "remote host fallback" : "local first-run fallback";

  it(`shows a retryable 503 warning and retains setup inventory in the ${surface}`, async () => {
    await mount(remoteClient);
    mode = "failed";
    act(() => button("Check again").click());
    await tick();
    expect(warning()).toBeDefined();
    expect(button("Check again").disabled).toBe(false);
    expect(store.state.instances).toEqual(initial());
    expect(container.textContent).not.toContain("Private fixture server detail");
    if (!remote) {
      expect(container.textContent).toContain("Install Claude");
      expect(container.textContent).toContain("Install Codex");
    }
    mode = "ready";
    instances = initial().map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, version: "fixture-new" } }));
    act(() => button("Check again").click());
    await tick();
    expect(warning()).toBeUndefined();
    expect(button("Check again").disabled).toBe(false);
    expect(store.state.instances).toEqual(instances);
    assertInventoryOnly();
  });

  it(`unlocks a stalled check, retries and ignores its late old inventory in the ${surface}`, async () => {
    await mount(remoteClient);
    mode = "pending";
    act(() => button("Check again").click());
    await tick();
    expect(button("Checking…").disabled).toBe(true);
    expect(warning()).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(INSTANCE_REFRESH_TIMEOUT_MS); });
    expect(button("Check again").disabled).toBe(false);
    expect(warning()).toBeDefined();
    expect(store.state.instances).toEqual(initial());
    const stale = finishPending!;
    mode = "ready";
    instances = initial().map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, version: "fixture-new" } }));
    act(() => button("Check again").click());
    await tick();
    stale(new Response(JSON.stringify({ instances: initial() })));
    await tick();
    expect(warning()).toBeUndefined();
    expect(store.state.instances).toEqual(instances);
    assertInventoryOnly();
  });

  it(`keeps completed background focus failures quiet in the ${surface}`, async () => {
    await mount(remoteClient);
    mode = "failed";
    act(() => window.dispatchEvent(new Event("focus")));
    await tick();
    expect(requests.filter((request) => request.path === "/api/instances")).toHaveLength(2);
    expect(warning()).toBeUndefined();
    expect(button("Check again").disabled).toBe(false);
    expect(store.state.instances).toEqual(initial());
    assertInventoryOnly();
  });

  it(`joins an in-flight focus probe and reports its failure in the ${surface}`, async () => {
    await mount(remoteClient);
    mode = "pending";
    act(() => window.dispatchEvent(new Event("focus")));
    await tick();
    const before = requests.filter((request) => request.path === "/api/instances").length;
    act(() => button("Check again").click());
    await tick();
    expect(requests.filter((request) => request.path === "/api/instances")).toHaveLength(before);
    finishPending!(new Response(JSON.stringify({ error: "Private fixture server detail" }), { status: 503 }));
    await tick();
    expect(warning()).toBeDefined();
    expect(button("Check again").disabled).toBe(false);
    expect(store.state.instances).toEqual(initial());
    assertInventoryOnly();
  });
}
