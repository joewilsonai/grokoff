// @vitest-environment happy-dom
// GrokOff modification (2026-10-09): prove custom CLI drafts own edits across delayed discovery.
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoreProvider, useStore, type InstanceInfo } from "@/state/store";
import { INSTANCE_REFRESH_TIMEOUT_MS, MODEL_REFRESH_TIMEOUT_MS } from "@/state/instance-refresh";
import { RefreshEngines, EngineCard, EngineSections } from "./EngineLibrary";
import { ClaudeAccountSettings } from "./ClaudeAccountSettings";
import { CodexAccountSettings } from "./CodexAccountSettings";
import { EnginesSettings } from "./EnginesSettings";
import { EnginesBeat } from "./onboarding/beats/EnginesBeat";

// Only the transport's event stream is replaced. The real store API helper,
// refresh coordinator, reducer, React state and account controls run here.
const live = vi.hoisted(() => ({ hydrate: null as null | (() => Promise<boolean>), frame: null as null | ((frame: { kind: string }) => void), automatic: true }));
vi.mock("@/lib/live-events", async (original) => ({
  ...await original<typeof import("@/lib/live-events")>(),
  openLiveEvents: (handlers: { onSnapshotRequired: () => Promise<boolean>; onFrame: (frame: { kind: string }) => void }) => {
    live.hydrate = handlers.onSnapshotRequired;
    live.frame = handlers.onFrame;
    if (live.automatic) queueMicrotask(() => void handlers.onSnapshotRequired());
    return () => {};
  },
}));

const initial = (): InstanceInfo[] => [
  {
    instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", cliDefault: "claude", access: "subscription",
    snapshot: { state: "available", authenticated: true, billing: "subscription", account: { email: "claude@example.test" } },
    models: { default: "claude-sonnet-5-5", options: [] },
    claudeAccount: { configDir: "/fixture/claude", signInCommand: "claude auth login", signInShell: "sh", isDefault: true },
    authentication: { method: "paste-code", signOut: true },
    install: { docsUrl: "https://fixture.invalid/claude" },
  },
  {
    instanceId: "codex", driverKind: "codex", displayName: "Codex", cliDefault: "codex", access: "subscription",
    snapshot: { state: "available", authenticated: true, billing: "subscription", account: { email: "codex@example.test" } },
    models: { default: "gpt-6.1-sol", options: [] }, authentication: { method: "device-code", signOut: true },
    install: { docsUrl: "https://fixture.invalid/codex" },
  },
];
let store: ReturnType<typeof useStore>;
function Harness() {
  store = useStore();
  const accounts = createElement(EngineSections, { instances: store.state.instances, renderEngine: (instance) =>
      createElement(EngineCard, { instance, children: createElement(instance.instanceId === "claude" ? ClaudeAccountSettings : CodexAccountSettings, { instance }) }),
  });
  if (onboarding) return createElement("div", null,
    createElement(EnginesBeat, { onNext: () => {}, onSkip: () => {}, setMascot: () => {}, bump: () => {} }),
    showAccountControls ? accounts : null);
  if (fullSettings) return strictSettings ? createElement(StrictMode, null, createElement(EnginesSettings)) : createElement(EnginesSettings);
  return createElement("div", null, createElement(RefreshEngines), accounts);
}

let root: Root;
let container: HTMLDivElement;
let instances: InstanceInfo[];
let mode: "ready" | "failed" | "pending";
let finishPending: ((value: Response) => void) | undefined;
let requests: Array<{ path: string; method: string }>;
let expectedMutation: "account" | "cli" | null;
let fullSettings: boolean;
let strictSettings: boolean;
let onboarding: boolean;
let holdModels: boolean;
let finishModels: ((response: Response) => void) | undefined;
let showAccountControls: boolean;
let expectedSignOut: "claude" | "codex" | null;
let holdCandidates: boolean;
let pendingCandidates: Array<{ resolve: (response: Response) => void; signal: AbortSignal | null | undefined }>;
const errorCopy = "Couldn't check your connections. Showing the last known status. Try again.";
const button = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button")].find((el) => el.textContent?.trim() === text)!;
const card = (id: string) => container.querySelector(`[data-engine-card="${id}"]`)!;
const tick = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };

beforeEach(async () => {
  vi.useFakeTimers();
  const preferences = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  instances = initial();
  requests = [];
  mode = "ready";
  finishPending = undefined;
  expectedMutation = null;
  fullSettings = false;
  strictSettings = false;
  onboarding = false;
  holdModels = false;
  finishModels = undefined;
  showAccountControls = false;
  expectedSignOut = null;
  holdCandidates = false;
  pendingCandidates = [];
  live.automatic = true;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    requests.push({ path, method: init?.method ?? "GET" });
    if (holdModels && path === "/api/instances/claude/refresh-models" && init?.method === "POST") return new Promise<Response>((resolve) => { finishModels = resolve; });
    if (expectedSignOut && path === `/api/instances/${expectedSignOut}/auth/sign-out` && init?.method === "POST") {
      instances = instances.map((instance) => instance.instanceId === expectedSignOut
        ? { ...instance, snapshot: { ...instance.snapshot, authenticated: false, account: undefined } }
        : instance);
      return new Response(JSON.stringify({ instances }));
    }
    // Mutation tests use only this in-memory fixture; every other mutation
    // is rejected before it can reach any native or provider surface.
    if (expectedMutation && path === "/api/instances/claude" && init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body));
      instances = instances.map((instance) => instance.instanceId === "claude" ? { ...instance, ...patch } : instance);
      return new Response(JSON.stringify({ ok: true }));
    }
    if (expectedMutation === "cli" && path === "/api/cli-test" && init?.method === "POST") return new Response(JSON.stringify({ ok: true, version: "fixture" }));
    if (path.startsWith("/api/cli-candidates?")) {
      if (holdCandidates) return new Promise<Response>((resolve) => pendingCandidates.push({ resolve, signal: init?.signal }));
      return new Response(JSON.stringify({ candidates: [] }));
    }
    if (path === "/api/instances") {
      if (mode === "failed") return new Response(JSON.stringify({ error: "Private server detail" }), { status: 503 });
      if (mode === "pending") return new Promise<Response>((resolve) => { finishPending = resolve; });
      return new Response(JSON.stringify({ instances }));
    }
    const bodies: Record<string, unknown> = {
      "/api/bots?messages=200": { bots: [], groups: [], sections: [] },
      "/api/config": {}, "/api/routines": { routines: [], runs: [] },
      "/api/webhooks": { webhooks: [] }, "/api/live/call": {},
    };
    if (!Object.hasOwn(bodies, path)) throw new Error(`Unexpected fixture request: ${path}`);
    return new Response(JSON.stringify(bodies[path]));
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(StoreProvider, null, createElement(Harness))); });
  await tick();
  expect(container.textContent).toContain("claude@example.test");
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

for (const target of ["global", "claude", "codex"]) {
  it(`reports the real store's 503 failure and successful retry from the ${target} check`, async () => {
    const scope = target === "global" ? container : card(target);
    const label = target === "global" ? "Check again" : "Check account";
    mode = "failed";
    act(() => button(scope, label).click());
    await tick();
    expect(scope.querySelector('[role="alert"]')?.textContent).toBe(errorCopy);
    expect(container.textContent).not.toContain("Private server detail");
    expect(button(scope, label).disabled).toBe(false);
    expect(container.textContent).toContain("claude@example.test");
    expect(container.textContent).toContain("codex@example.test");
    expect(store.state.instances.every((instance) => instance.snapshot.authenticated)).toBe(true);
    mode = "ready";
    instances = instances.map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, account: { email: `${instance.instanceId}-new@example.test` } } }));
    act(() => button(scope, label).click());
    await tick();
    expect(scope.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("claude-new@example.test");
    expect(container.textContent).toContain("codex-new@example.test");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });
}

it("unlocks a hung check at the shared deadline and rejects its late inventory after a retry", async () => {
  mode = "pending";
  act(() => button(container, "Check again").click());
  await tick();
  expect(button(container, "Checking…").disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(INSTANCE_REFRESH_TIMEOUT_MS); });
  expect(button(container, "Check again").disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(errorCopy);
  mode = "ready";
  const old = initial();
  instances = instances.map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, account: { email: "new@example.test" } } }));
  act(() => button(container, "Check again").click());
  await tick();
  finishPending!(new Response(JSON.stringify({ instances: old })));
  await tick();
  expect(container.textContent).toContain("new@example.test");
  expect(container.textContent).not.toContain("claude@example.test");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("keeps a quiet focus check handled, preserves account drafts, and protects a confirmed snapshot", async () => {
  const details = card("claude") as HTMLDetailsElement;
  details.open = true;
  (details.querySelector("div > details") as HTMLDetailsElement).open = true;
  const name = details.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Unsaved name");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  mode = "failed";
  act(() => window.dispatchEvent(new Event("focus")));
  await tick();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  details.open = false;
  details.open = true;
  expect((details.querySelector("input") as HTMLInputElement).value).toBe("Unsaved name");
  mode = "pending";
  const pending = store.refreshInstances();
  await tick();
  act(() => store.dispatch({ type: "instances", instances: instances.map((instance) => ({ ...instance, snapshot: { state: "available", authenticated: false } })) }));
  await pending;
  finishPending!(new Response(JSON.stringify({ instances: initial() })));
  await tick();
  expect(store.state.instances.every((instance) => instance.snapshot.authenticated === false)).toBe(true);
  expect(requests.every((request) => request.method === "GET")).toBe(true);
});

for (const snapshotFirst of [true, false]) {
  it(`shares the same successful inventory when ${snapshotFirst ? "reconnect" : "explicit check"} starts first`, async () => {
    mode = "pending";
    const count = requests.filter((request) => request.path === "/api/instances").length;
    const first = snapshotFirst ? live.hydrate!() : store.refreshInstances({ reportFailure: true });
    await tick();
    const answer = finishPending!;
    const second = snapshotFirst ? store.refreshInstances({ reportFailure: true }) : live.hydrate!();
    await tick();
    expect(requests.filter((request) => request.path === "/api/instances").length).toBe(count + 1);
    answer(new Response(JSON.stringify({ instances: initial().map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, account: { email: "new@example.test" } } })) })));
    await act(async () => { await Promise.all([first, second]); });
    expect(container.textContent).toContain("new@example.test");
  });
}

for (const focusFirst of [true, false]) {
  it(`cannot suppress startup with a failed newer focus probe when ${focusFirst ? "focus" : "startup"} starts first`, async () => {
    act(() => root.unmount());
    root = createRoot(container);
    requests = [];
    mode = "pending";
    live.automatic = !focusFirst;
    await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
    await tick();
    if (focusFirst) {
      act(() => window.dispatchEvent(new Event("focus")));
      await tick();
    }
    const answer = finishPending!;
    mode = "failed";
    if (focusFirst) void live.hydrate!();
    else act(() => window.dispatchEvent(new Event("focus")));
    await tick();
    expect(requests.filter((request) => request.path === "/api/instances")).toHaveLength(1);
    answer(new Response(JSON.stringify({ instances: initial() })));
    await tick();
    expect(store.state.instances).toHaveLength(2);
    expect(container.textContent).toContain("claude@example.test");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
}

it("preserves loader retry handling when startup and focus share a failed inventory", async () => {
  act(() => root.unmount());
  root = createRoot(container);
  mode = "pending";
  requests = [];
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
  await tick();
  act(() => window.dispatchEvent(new Event("focus")));
  await tick();
  finishPending!(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
  await tick();
  expect(store.state.instances).toHaveLength(0);
  expect(warn).toHaveBeenCalled();
  mode = "ready";
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  await tick();
  expect(store.state.instances).toHaveLength(2);
  expect(requests.filter((request) => request.path === "/api/instances")).toHaveLength(2);
  warn.mockRestore();
});

for (const olderFirst of [true, false]) {
  it(`preserves the new config inventory when an older explicit response finishes ${olderFirst ? "first" : "last"}`, async () => {
    mode = "pending";
    const explicit = store.refreshInstances({ reportFailure: true }).catch((error: unknown) => error);
    await tick();
    const older = finishPending!;
    act(() => live.frame!({ kind: "config" }));
    await tick();
    const newer = finishPending!;
    const oldResponse = () => older(new Response(JSON.stringify({ instances: initial() })));
    const newResponse = () => newer(new Response(JSON.stringify({ instances: initial().map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, account: { email: "new@example.test" } } })) })));
    if (olderFirst) {
      oldResponse();
      await tick();
      newResponse();
    } else {
      newResponse();
      await tick();
      oldResponse();
    }
    await tick();
    expect(await explicit).toBeUndefined();
    expect(container.textContent).toContain("new@example.test");
    expect(container.textContent).not.toContain("claude@example.test");
  });
}

for (const mutation of ["account", "cli"] as const) {
  it(`starts a fresh inventory after the actual ${mutation} save instead of applying an older probe`, async () => {
    if (mutation === "cli") {
      fullSettings = true;
      await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
      act(() => button(card("claude"), "Set CLI…").click());
      await tick();
    }
    const input = mutation === "account"
      ? card("claude").querySelector("input")!
      : card("claude").querySelector('input[aria-label]')!;
    expect(input).not.toBeNull();
    const value = mutation === "account" ? "Saved name" : "/fixture/new-claude";
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const previous = structuredClone(instances);
    mode = "pending";
    const background = store.refreshInstances();
    await tick();
    const oldResponse = finishPending!;
    const oldSignal = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/instances").at(-1)![1]!.signal!;
    mode = "ready";
    expectedMutation = mutation;
    act(() => {
      if (mutation === "account") (input as HTMLInputElement).form!.requestSubmit();
      else button(input.parentElement!, "Save").click();
    });
    await tick();
    await background;
    expect(oldSignal.aborted).toBe(true);
    oldResponse(new Response(JSON.stringify({ instances: previous })));
    await tick();
    expect(store.state.instances[0]![mutation === "account" ? "displayName" : "cli"]).toBe(value);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(requests.filter((request) => request.path === "/api/instances").length).toBe(3);
    expect(requests.some((request) => request.path === "/api/instances/claude" && request.method === "PATCH")).toBe(true);
    expect(requests.some((request) => /auth|install|sign-out/.test(request.path))).toBe(false);
  });
}

for (const saveFirst of [true, false]) {
  it(`protects the actual account save when older model discovery completes ${saveFirst ? "after" : "before"} its inventory`, async () => {
    const olderInventory = structuredClone(instances);
    holdModels = true;
    const discovery = store.refreshModels("claude");
    await tick();
    const input = card("claude").querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Saved name");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expectedMutation = "account";
    mode = saveFirst ? "ready" : "pending";
    act(() => (input as HTMLInputElement).form!.requestSubmit());
    await tick();
    const saveResponse = finishPending;
    const saveSignal = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/instances").at(-1)![1]!.signal!;
    const saveInventory = structuredClone(instances);
    // The discovery completed on the fixture after the save. Its response
    // still contains the old account, but its completed catalog is now in GET.
    instances = instances.map((instance) => instance.instanceId === "claude"
      ? { ...instance, models: { default: "claude-sonnet-5-5", options: [{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }] } }
      : instance);
    mode = "ready";
    finishModels!(new Response(JSON.stringify({ instances: olderInventory })));
    await act(async () => { await discovery; });
    if (!saveFirst) {
      expect(saveSignal.aborted).toBe(true);
      saveResponse!(new Response(JSON.stringify({ instances: saveInventory })));
      await tick();
    }
    expect(store.state.instances[0]!.displayName).toBe("Saved name");
    expect(store.state.instances[0]!.models.options).toEqual([{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }]);
    expect(requests.filter((request) => request.path === "/api/instances/claude/refresh-models")).toHaveLength(1);
    expect(requests.filter((request) => request.path === "/api/instances")).toHaveLength(3);
    expect(requests.some((request) => /auth|install|sign-out/.test(request.path))).toBe(false);
  });
}

it("bounds model discovery with provider headroom and rejects a late model response", async () => {
  holdModels = true;
  const discovery = store.refreshModels("claude").catch((error: unknown) => error);
  await tick();
  const signal = vi.mocked(fetch).mock.calls.find(([path]) => String(path).endsWith("/refresh-models"))![1]!.signal!;
  await act(async () => { await vi.advanceTimersByTimeAsync(INSTANCE_REFRESH_TIMEOUT_MS); });
  expect(signal.aborted).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(MODEL_REFRESH_TIMEOUT_MS - INSTANCE_REFRESH_TIMEOUT_MS); });
  expect(await discovery).toEqual(new Error("Model discovery timed out. Try again."));
  expect(signal.aborted).toBe(true);
  finishModels!(new Response(JSON.stringify({ instances: initial().map((instance) => ({ ...instance, displayName: "Late inventory" })) })));
  await tick();
  expect(store.state.instances[0]!.displayName).toBe("Claude");
  expect(store.state.instances.every((instance) => instance.snapshot.authenticated)).toBe(true);
});

it("cancels model discovery when its store unmounts", async () => {
  holdModels = true;
  const discovery = store.refreshModels("claude").catch((error: unknown) => error);
  await tick();
  const signal = vi.mocked(fetch).mock.calls.find(([path]) => String(path).endsWith("/refresh-models"))![1]!.signal!;
  act(() => root.unmount());
  expect(signal.aborted).toBe(true);
  expect(await discovery).toBeInstanceOf(Error);
  root = createRoot(container);
});

for (const olderFirst of [true, false]) {
  it(`keeps onboarding ready when a pre-login inventory finishes ${olderFirst ? "before" : "after"} the fresh login inventory`, async () => {
    const signedOut = instances.map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, authenticated: false } }));
    act(() => store.dispatch({ type: "instances", instances: signedOut }));
    onboarding = true;
    mode = "pending";
    await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
    await tick();
    expect(container.textContent).toContain("Needs setup");
    const older = finishPending!;
    const oldSignal = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/instances").at(-1)![1]!.signal!;
    // EngineSetup's confirmed login uses this same fresh store entry point.
    const login = store.refreshInstances({ fresh: true, reportFailure: true });
    await tick();
    const newer = finishPending!;
    const oldResponse = () => older(new Response(JSON.stringify({ instances: signedOut })));
    const newResponse = () => newer(new Response(JSON.stringify({ instances: initial() })));
    if (olderFirst) {
      oldResponse();
      await tick();
      newResponse();
    } else {
      newResponse();
      await tick();
      oldResponse();
    }
    await act(async () => { await login; });
    expect(oldSignal.aborted).toBe(true);
    expect(store.state.instances.every((instance) => instance.snapshot.authenticated)).toBe(true);
    expect(container.textContent).toContain("Everything is ready");
    expect(container.textContent).not.toContain("Needs setup");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(button(container, "Check again").disabled).toBe(false);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });
}

it("keeps onboarding inventory and offers retry after an actual shared 503", async () => {
  onboarding = true;
  mode = "failed";
  await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
  await tick();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Couldn't check your AI connections. Try again.");
  expect(store.state.instances).toHaveLength(2);
  expect(button(container, "Check again").disabled).toBe(false);
  mode = "ready";
  act(() => button(container, "Check again").click());
  await tick();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("Everything is ready");
});

for (const succeeds of [true, false]) {
  it(`shows the replacement's ${succeeds ? "success" : "failure"} when an actual account save supersedes a global check`, async () => {
    mode = "pending";
    act(() => button(container, "Check again").click());
    await tick();
    const older = finishPending!;
    const previous = structuredClone(instances);
    const input = card("claude").querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Saved name");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expectedMutation = "account";
    mode = succeeds ? "ready" : "failed";
    act(() => (input as HTMLInputElement).form!.requestSubmit());
    await tick();
    older(new Response(JSON.stringify({ instances: previous })));
    await tick();
    expect(button(container, "Check again").disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent ?? null).toBe(succeeds ? null : errorCopy);
    expect(store.state.instances[0]!.displayName).toBe(succeeds ? "Saved name" : "Claude");
    if (!succeeds) {
      mode = "ready";
      act(() => button(container, "Check again").click());
      await tick();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(store.state.instances[0]!.displayName).toBe("Saved name");
    }
  });
}

it("reports a failed fresh login inventory to the superseded onboarding check", async () => {
  onboarding = true;
  mode = "pending";
  await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
  await tick();
  const older = finishPending!;
  mode = "failed";
  await act(async () => { await store.refreshInstances({ fresh: true }); });
  older(new Response(JSON.stringify({ instances: initial() })));
  await tick();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Couldn't check your AI connections. Try again.");
  expect(button(container, "Check again").disabled).toBe(false);
  expect(store.state.instances).toHaveLength(2);
  mode = "ready";
  act(() => button(container, "Check again").click());
  await tick();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

for (const target of ["global", "onboarding"] as const) {
  it(`accepts successful model inventory while a ${target} check is pending without showing failure`, async () => {
    holdModels = true;
    const discovery = store.refreshModels("claude");
    await tick();
    mode = "pending";
    if (target === "onboarding") {
      onboarding = true;
      await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
    } else act(() => button(container, "Check again").click());
    await tick();
    const oldResponse = finishPending!;
    const signal = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/instances").at(-1)![1]!.signal!;
    const current = initial().map((instance) => instance.instanceId === "claude"
      ? { ...instance, models: { default: "claude-sonnet-5-5", options: [{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }] } }
      : instance);
    finishModels!(new Response(JSON.stringify({ instances: current })));
    await act(async () => { await discovery; });
    oldResponse(new Response(JSON.stringify({ instances: initial() })));
    await tick();
    expect(signal.aborted).toBe(true);
    expect(button(container, "Check again").disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(store.state.instances[0]!.models.options).toHaveLength(1);
    expect(requests.filter((request) => request.path === "/api/instances")).toHaveLength(2);
    expect(requests.some((request) => /auth|install|sign-out/.test(request.path))).toBe(false);
  });

  for (const account of ["claude", "codex"] as const) {
    it(`accepts the confirmed ${account} sign-out while a ${target} check is pending without showing failure`, async () => {
      const signOutLabel = account === "claude" ? "Sign out of Claude" : "Sign out of ChatGPT";
      mode = "pending";
      if (target === "onboarding") {
        onboarding = true;
        showAccountControls = true;
        await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
      } else act(() => button(container, "Check again").click());
      await tick();
      const oldResponse = finishPending!;
      const signal = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/instances").at(-1)![1]!.signal!;
      act(() => button(card(account), signOutLabel).click());
      await tick();
      expectedSignOut = account;
      // A redundant GET after this confirmed response would fail. The direct
      // successful response must still resolve both the UI and shared check.
      mode = "failed";
      act(() => button(document.querySelector('[role="alertdialog"]')!, signOutLabel).click());
      await tick();
      oldResponse(new Response(JSON.stringify({ instances: initial() })));
      await tick();
      expect(signal.aborted).toBe(true);
      expect(button(container, "Check again").disabled).toBe(false);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(store.state.instances.find((instance) => instance.instanceId === account)!.snapshot.authenticated).toBe(false);
      expect(requests.filter((request) => request.path === "/api/instances")).toHaveLength(2);
      expect(requests.filter((request) => request.method !== "GET")).toEqual([{ path: `/api/instances/${account}/auth/sign-out`, method: "POST" }]);
    });
  }
}


const openHeldCliPicker = async (candidates: string[] = []) => {
  holdCandidates = true;
  fullSettings = true;
  instances[0] = { ...instances[0]!, cli: "/fixture/old-claude", cliCandidates: candidates };
  await act(async () => { store.dispatch({ type: "instances", instances }); });
  await act(async () => root.render(createElement(StoreProvider, null, createElement(Harness))));
  act(() => button(card("claude"), "Set CLI…").click());
  await tick();
  expect(pendingCandidates).toHaveLength(strictSettings ? 2 : 1);
  return card("claude").querySelector<HTMLInputElement>('input[aria-label="Claude custom CLI path"]')!;
};
const changeCli = async (input: HTMLInputElement, value: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tick();
};
const finishCandidates = async (index: number, candidates: string[], status = 200) => {
  pendingCandidates[index]!.resolve(new Response(JSON.stringify(status === 200 ? { candidates } : { error: "Synthetic discovery failure" }), { status }));
  await tick();
};

it("retains a typed replacement CLI when delayed candidate discovery completes", async () => {
  const input = await openHeldCliPicker();
  expect(input).not.toBeNull();
  await changeCli(input, "/fixture/new-claude");
  await finishCandidates(0, []);
  expect(input.value).toBe("/fixture/new-claude");
  expect(button(input.parentElement!, "Save").disabled).toBe(false);
  expectedMutation = "cli";
  act(() => button(input.parentElement!, "Save").click());
  await tick();
  const mutations = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/cli-test" || path === "/api/instances/claude");
  expect(mutations.map(([, init]) => JSON.parse(String(init!.body)).cli)).toEqual(["/fixture/new-claude", "/fixture/new-claude"]);
  expect(store.state.instances[0]!.cli).toBe("/fixture/new-claude");
});

it("retains a selected detected CLI when delayed discovery returns the old override", async () => {
  const input = await openHeldCliPicker(["/fixture/old-claude", "/fixture/new-claude"]);
  const select = card("claude").querySelector("select")!;
  act(() => { select.value = "/fixture/new-claude"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await tick();
  await finishCandidates(0, ["/fixture/old-claude", "/fixture/new-claude"]);
  expect(select.value).toBe("/fixture/new-claude");
  expect(input.value).toBe("");
  expect(button(input.parentElement!, "Save").disabled).toBe(false);
});

for (const detected of [true, false]) it(`initializes an untouched ${detected ? "detected" : "manual"} CLI override after discovery`, async () => {
  const input = await openHeldCliPicker(detected ? ["/fixture/old-claude"] : []);
  await finishCandidates(0, detected ? ["/fixture/old-claude"] : []);
  expect(input.value).toBe(detected ? "" : "/fixture/old-claude");
  if (detected) expect(card("claude").querySelector("select")!.value).toBe("/fixture/old-claude");
  expect(button(input.parentElement!, "Save").disabled).toBe(true);
  expect(requests.some(({ method }) => method === "POST" || method === "PATCH")).toBe(false);
});

it("keeps the edited path usable when candidate discovery fails", async () => {
  const input = await openHeldCliPicker();
  await changeCli(input, "/fixture/new-claude");
  await finishCandidates(0, [], 503);
  expect(input.value).toBe("/fixture/new-claude");
  expect(button(input.parentElement!, "Save").disabled).toBe(false);
  expect(requests.some(({ method }) => method === "POST" || method === "PATCH")).toBe(false);
});

it("cancels closed picker discovery and ignores its late response after reopening", async () => {
  await openHeldCliPicker();
  act(() => button(card("claude"), "Cancel").click());
  await act(async () => { await vi.advanceTimersByTimeAsync(201); });
  expect(pendingCandidates[0]!.signal?.aborted).toBe(true);
  act(() => button(card("claude"), "Set CLI…").click());
  await tick();
  expect(pendingCandidates).toHaveLength(2);
  const input = card("claude").querySelector<HTMLInputElement>('input[aria-label="Claude custom CLI path"]')!;
  await changeCli(input, "/fixture/reopened-claude");
  await finishCandidates(0, ["/fixture/old-claude"]);
  expect(input.value).toBe("/fixture/reopened-claude");
  await finishCandidates(1, []);
  expect(input.value).toBe("/fixture/reopened-claude");
  expect(pendingCandidates[1]!.signal?.aborted).toBe(false);
  expect(requests.some(({ method }) => method === "POST" || method === "PATCH")).toBe(false);
});


it("does not restore a cleared manual CLI draft when discovery finishes", async () => {
  const input = await openHeldCliPicker();
  await changeCli(input, "");
  await finishCandidates(0, []);
  expect(input.value).toBe("");
  expect(button(input.parentElement!, "Save").disabled).toBe(true);
  expect(requests.some(({ method }) => method === "POST" || method === "PATCH")).toBe(false);
});

it("does not restore the saved detected CLI after an explicit empty selection", async () => {
  const input = await openHeldCliPicker(["/fixture/old-claude"]);
  const select = card("claude").querySelector("select")!;
  act(() => { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await tick();
  await finishCandidates(0, ["/fixture/old-claude"]);
  expect(select.value).toBe("");
  expect(input.value).toBe("");
  expect(button(input.parentElement!, "Save").disabled).toBe(true);
});

it("restarts canceled candidate discovery during StrictMode setup replay", async () => {
  strictSettings = true;
  const input = await openHeldCliPicker(["/fixture/old-claude"]);
  expect(pendingCandidates[0]!.signal?.aborted).toBe(true);
  expect(pendingCandidates[1]!.signal?.aborted).toBe(false);
  await finishCandidates(0, ["/fixture/stale-claude"]);
  await finishCandidates(1, ["/fixture/old-claude"]);
  expect(card("claude").querySelector("select")!.value).toBe("/fixture/old-claude");
  expect(input.value).toBe("");
  expect(container.textContent).not.toContain("/fixture/stale-claude");
  expect(button(input.parentElement!, "Save").disabled).toBe(true);
});


for (const found of [[], ["/fixture/old-claude"]]) it(`keeps a selected CLI visible when discovery omits it (${found.length} candidates)`, async () => {
  const input = await openHeldCliPicker(["/fixture/old-claude", "/fixture/new-claude"]);
  const select = card("claude").querySelector("select")!;
  act(() => { select.value = "/fixture/new-claude"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await tick();
  await finishCandidates(0, found);
  expect(card("claude").querySelector("select")).toBe(select);
  expect(select.value).toBe("/fixture/new-claude");
  expect(select.selectedOptions[0]?.textContent).toBe("/fixture/new-claude");
  expect(input.value).toBe("");
  expect(button(input.parentElement!, "Save").disabled).toBe(false);
  expectedMutation = "cli";
  act(() => button(input.parentElement!, "Save").click());
  await tick();
  const mutations = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/cli-test" || path === "/api/instances/claude");
  expect(mutations.map(([, init]) => JSON.parse(String(init!.body)).cli)).toEqual(["/fixture/new-claude", "/fixture/new-claude"]);
});
