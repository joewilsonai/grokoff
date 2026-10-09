// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoreProvider, useStore, type InstanceInfo } from "@/state/store";
import { setLocale } from "@/lib/i18n";
import { MODEL_REFRESH_TIMEOUT_MS } from "@/state/instance-refresh";
import { ProviderAuthSessions } from "../../server/provider-auth-sessions";
import type { ProviderAuthenticationStart, ProviderAuthenticationStatus } from "../../server/contracts";
import { EnginesSettings } from "./EnginesSettings";
import { EnginesBeat } from "./onboarding/beats/EnginesBeat";
import { SignInModelRecoveries } from "./SignInModelRecovery";

// Only the event stream and HTTP transport are synthetic. The real React
// component, store, API helper and sign-in ownership controller run together.
// The provider is an in-memory fake: it starts no CLI and has no credentials.
vi.mock("@/lib/live-events", async (original) => ({
  ...await original<typeof import("@/lib/live-events")>(),
  openLiveEvents: (handlers: { onSnapshotRequired: () => Promise<boolean> }) => {
    queueMicrotask(() => void handlers.onSnapshotRequired());
    return () => {};
  },
}));

const challenge = {
  phase: "waiting" as const, flowId: "fixture-claude-flow",
  authorizationUrl: "https://claude.com/cai/oauth/authorize?state=fixture",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
};
const refreshWarning = "Claude signed in, but your connection and models couldn't be refreshed. Check again to retry.";
let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof useStore>;
let sessions: ProviderAuthSessions;
let authenticated: boolean;
let siblingAuthenticated: boolean;
let includeSibling: boolean;
let completionError: string | null;
let inventoryFailed: boolean;
let modelsFailed: boolean;
let alreadySignedIn: boolean;
let holdModels: boolean;
let finishModels: ((response: Response) => void) | undefined;
let holdSiblingModels: boolean;
let finishSiblingModels: ((response: Response) => void) | undefined;
let holdInventory: boolean;
let finishInventory: ((response: Response) => void) | undefined;
let requests: Array<{ path: string; method: string }>;
let surface: "settings" | "onboarding" | "shell" | "closed";
let provider: {
  instanceId: string;
  startAuthentication: () => Promise<ProviderAuthenticationStart>;
  completeAuthentication: (flowId: string, code: string) => Promise<void>;
  getAuthentication: () => Promise<ProviderAuthenticationStatus>;
};
let siblingProvider: typeof provider;

const inventory = (): InstanceInfo[] => [{
  instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", cliDefault: "claude", access: "subscription",
  snapshot: { state: "available", authenticated, ...(authenticated ? { billing: "subscription", account: { email: "fixture@example.test" } } : {}) },
  models: { default: "claude-sonnet-5-5", options: [] },
  authentication: { method: "paste-code" }, install: { docsUrl: "https://fixture.invalid/claude" },
}, ...(includeSibling ? [{
  instanceId: "claude-secondary", driverKind: "claudeAgent", displayName: "Claude second", cliDefault: "claude", access: "subscription" as const,
  snapshot: { state: "available" as const, authenticated: siblingAuthenticated, ...(siblingAuthenticated ? { billing: "subscription" as const, account: { email: "second@example.test" } } : {}) },
  models: { default: "claude-sonnet-5-5", options: [] },
  authentication: { method: "paste-code" as const }, install: { docsUrl: "https://fixture.invalid/claude" },
}] : [])];
function Harness() {
  store = useStore();
  if (surface === "closed") return null;
  if (surface === "onboarding") return createElement(EnginesBeat, { onNext: () => {}, onSkip: () => {}, setMascot: () => {}, bump: () => {} });
  if (surface === "shell") return createElement(SignInModelRecoveries);
  return createElement(EnginesSettings);
}
const card = (id = "claude") => container.querySelector(`[data-engine-card="${id}"]`) ?? container;
const button = (label: string, id = "claude") => [...(label === "Check again" || label === "Checking…" ? card(id).querySelector(`[data-sign-in-model-recovery="${id}"]`) ?? card(id) : card(id)).querySelectorAll("button")].find((el) => el.textContent?.trim() === label)!;
const tick = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
async function begin(id = "claude") {
  act(() => button("Sign in to Claude", id).click());
  await tick();
  expect(container.textContent).toContain("Finish sign-in");
  const input = card(id).querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "GOODCODE#fixture");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("Finish sign-in", id).disabled).toBe(false);
}
async function finish(id = "claude") {
  act(() => button("Finish sign-in", id).click());
  await tick();
}
const count = (suffix: string) => requests.filter(({ path }) => path.includes(suffix)).length;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const preferences = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) });
  setLocale("en");
  surface = "settings";
  sessions = new ProviderAuthSessions();
  authenticated = false;
  siblingAuthenticated = false;
  includeSibling = false;
  completionError = null;
  inventoryFailed = false;
  modelsFailed = false;
  alreadySignedIn = false;
  holdModels = false;
  finishModels = undefined;
  holdSiblingModels = false;
  finishSiblingModels = undefined;
  holdInventory = false;
  finishInventory = undefined;
  requests = [];
  provider = {
    instanceId: "claude", startAuthentication: async () => {
      if (!alreadySignedIn) return challenge;
      authenticated = true;
      return { phase: "succeeded", flowId: null, authorizationUrl: null, expiresAt: null };
    },
    completeAuthentication: async (flowId, code) => {
      expect(flowId).toBe(challenge.flowId);
      expect(code).toBe("GOODCODE#fixture");
      if (completionError) throw new Error(completionError);
      authenticated = true;
    },
    getAuthentication: async () => challenge,
  };
  const siblingChallenge = { ...challenge, flowId: "fixture-claude-secondary-flow" };
  siblingProvider = {
    instanceId: "claude-secondary", startAuthentication: async () => siblingChallenge,
    completeAuthentication: async (flowId, code) => {
      expect(flowId).toBe(siblingChallenge.flowId);
      expect(code).toBe("GOODCODE#fixture");
      siblingAuthenticated = true;
    },
    getAuthentication: async () => siblingChallenge,
  };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push({ path, method });
    try {
      const authRoute = path.match(/^\/api\/instances\/(claude(?:-secondary)?)\/auth\/(start|complete|status)(?:\?|$)/);
      const ownedProvider = authRoute?.[1] === "claude-secondary" ? siblingProvider : provider;
      if (authRoute?.[2] === "start" && method === "POST") return Response.json({ auth: await sessions.start(ownedProvider, "fixture-owner") });
      if (authRoute?.[2] === "complete" && method === "POST") {
        const body = JSON.parse(String(init!.body));
        await sessions.complete(ownedProvider.instanceId, "fixture-owner", body.flowId, body.code);
        return Response.json({ ok: true });
      }
      if (authRoute?.[2] === "status" && method === "GET") return Response.json({ auth: await sessions.status(ownedProvider.instanceId, "fixture-owner", new URL(path, "http://fixture.invalid").searchParams.get("flowId")!) });
      if (path === "/api/instances" && method === "GET") {
        if (holdInventory) return new Promise<Response>((resolve) => { finishInventory = resolve; });
        return inventoryFailed ? Response.json({ error: "Private inventory failure" }, { status: 503 }) : Response.json({ instances: inventory() });
      }
      if (path === "/api/instances/claude/refresh-models" && method === "POST") {
        if (holdModels) return new Promise<Response>((resolve) => { finishModels = resolve; });
        // This production endpoint discovers models and then describes current
        // inventory; either stage can fail before it publishes a ready card.
        if (modelsFailed || inventoryFailed) return Response.json({ error: modelsFailed ? "Private model failure" : "Private inventory failure" }, { status: 503 });
        return Response.json({ instances: inventory() });
      }
      if (path === "/api/instances/claude-secondary/refresh-models" && method === "POST") {
        if (holdSiblingModels) return new Promise<Response>((resolve) => { finishSiblingModels = resolve; });
        return Response.json({ instances: inventory() });
      }
      const bodies: Record<string, unknown> = {
        "/api/bots?messages=200": { bots: [], groups: [], sections: [] }, "/api/config": {},
        "/api/routines": { routines: [], runs: [] }, "/api/webhooks": { webhooks: [] }, "/api/live/call": {},
      };
      if (method === "GET" && Object.hasOwn(bodies, path)) return Response.json(bodies[path]);
      throw new Error(`Unexpected fixture request: ${method} ${path}`);
    } catch (cause) {
      const status = cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 500;
      return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status });
    }
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(StoreProvider, null, createElement(Harness))); });
  await tick();
  expect(store.state.instances[0]?.snapshot.authenticated).toBe(false);
  (card() as HTMLDetailsElement).open = true;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  sessions.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("accepts successful pasted-code completion without querying the deleted owner flow", async () => {
  await begin();
  await finish();
  expect(authenticated).toBe(true);
  await expect(sessions.status("claude", "fixture-owner", challenge.flowId)).rejects.toMatchObject({ status: 404 });
  expect(container.textContent).toContain("Claude connected on this server");
  expect(container.textContent).not.toContain("no longer available");
  expect(store.state.instances[0]?.snapshot.authenticated).toBe(true);
  expect(count("/auth/complete")).toBe(1);
  expect(count("/auth/status")).toBe(0);
  expect(count("/refresh-models")).toBe(1);
});

it("preserves a rejected code as a retryable sign-in failure", async () => {
  completionError = "Anthropic did not accept that code. Paste the whole code and try again.";
  await begin();
  await finish();
  expect(authenticated).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(completionError);
  expect(container.textContent).not.toContain("Claude connected");
  expect(button("Finish sign-in").disabled).toBe(false);
  expect(count("/refresh-models")).toBe(0);
});

for (const failedStage of ["inventory", "models"] as const) {
  it(`keeps confirmed sign-in and retries only discovery after a ${failedStage} failure`, async () => {
    await begin();
    inventoryFailed = failedStage === "inventory";
    modelsFailed = failedStage === "models";
    await finish();
    expect(authenticated).toBe(true);
    expect(container.textContent).toContain("Claude connected");
    expect(card().querySelector('[role="alert"]')?.textContent).toBe(refreshWarning);
    expect((card() as HTMLDetailsElement).open).toBe(true);
    expect(card().querySelector("[data-claude-sign-in]")).not.toBeNull();
    expect(container.textContent).not.toContain("Private ");
    expect(button("Check again").disabled).toBe(false);
    const mutations = count("/auth/");
    inventoryFailed = false;
    modelsFailed = false;
    act(() => button("Check again").click());
    await tick();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Claude connected on this server");
    expect(store.state.instances[0]?.snapshot.authenticated).toBe(true);
    expect(count("/auth/")).toBe(mutations);
    expect(count("/auth/start")).toBe(1);
    expect(count("/auth/complete")).toBe(1);
    expect(count("/auth/status")).toBe(0);
  });
}

it("refreshes an already-succeeded startup without asking for or replaying a code", async () => {
  alreadySignedIn = true;
  act(() => button("Sign in to Claude").click());
  await tick();
  expect(container.textContent).toContain("Claude connected on this server");
  expect(store.state.instances[0]?.snapshot.authenticated).toBe(true);
  expect(count("/auth/start")).toBe(1);
  expect(count("/auth/complete")).toBe(0);
  expect(count("/auth/status")).toBe(0);
  expect(count("/refresh-models")).toBe(1);
});

it("bounds discovery, keeps a visible parent-card retry and ignores its late response", async () => {
  await begin();
  holdModels = true;
  await finish();
  const late = finishModels!;
  const signal = vi.mocked(fetch).mock.calls.find(([path]) => String(path).endsWith("/refresh-models"))![1]!.signal!;
  await act(async () => { await vi.advanceTimersByTimeAsync(MODEL_REFRESH_TIMEOUT_MS); });
  expect(signal.aborted).toBe(true);
  expect(card().querySelector('[role="alert"]')?.textContent).toBe(refreshWarning);
  expect(card().querySelector("[data-claude-sign-in]")).not.toBeNull();
  expect(button("Check again").disabled).toBe(false);
  act(() => button("Check again").click());
  await tick();
  expect(button("Checking…").disabled).toBe(true);
  const retried = finishModels!;
  holdModels = false;
  retried(Response.json({ instances: inventory() }));
  await tick();
  expect(container.textContent).toContain("Claude connected on this server");
  const stale = inventory().map((instance) => ({ ...instance, snapshot: { ...instance.snapshot, authenticated: false } }));
  late(Response.json({ instances: stale }));
  await tick();
  expect(store.state.instances[0]?.snapshot.authenticated).toBe(true);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(count("/auth/complete")).toBe(1);
  expect(count("/auth/start")).toBe(1);
  expect(count("/refresh-models")).toBe(2);
});

for (const olderFirst of [true, false]) {
  it(`preserves connected parent readiness when pre-login inventory finishes ${olderFirst ? "before" : "after"} discovery`, async () => {
    await begin();
    const stale = inventory();
    holdInventory = true;
    const old = store.refreshInstances({ reportFailure: true });
    await tick();
    const earlier = finishInventory!;
    const oldSignal = vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/instances").at(-1)![1]!.signal!;
    holdModels = true;
    await finish();
    const discovered = finishModels!;
    if (olderFirst) {
      earlier(Response.json({ instances: stale }));
      await tick();
    }
    discovered(Response.json({ instances: inventory() }));
    await tick();
    if (!olderFirst) {
      expect(oldSignal.aborted).toBe(true);
      earlier(Response.json({ instances: stale }));
      await tick();
    }
    await old;
    expect(store.state.instances[0]?.snapshot.authenticated).toBe(true);
    expect(container.textContent).toContain("Claude connected on this server");
    expect(container.textContent).not.toContain("no longer available");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(count("/auth/complete")).toBe(1);
    expect(count("/auth/status")).toBe(0);
  });
}

for (const focusBeforeFailure of [true, false]) {
  it(`keeps recovery in the real Settings parent when focus publishes login ${focusBeforeFailure ? "during" : "after"} discovery`, async () => {
    await begin();
    holdModels = true;
    await finish();
    const discovery = finishModels!;
    if (!focusBeforeFailure) {
      discovery(Response.json({ error: "Private model failure" }, { status: 503 }));
      await tick();
    }
    act(() => window.dispatchEvent(new Event("focus")));
    await tick();
    expect(store.state.instances[0]?.snapshot.authenticated).toBe(true);
    expect(card().querySelector("[data-claude-sign-in]")).toBeNull();
    if (focusBeforeFailure) {
      expect(store.signInModelDiscovery.claude).toBe("checking");
      expect(button("Checking…").disabled).toBe(true);
      discovery(Response.json({ error: "Private model failure" }, { status: 503 }));
      await tick();
    }
    expect(card().querySelector('[role="alert"]')?.textContent).toBe(refreshWarning);
    holdModels = false;
    act(() => button("Check again").click());
    await tick();
    expect(card().querySelector('[role="alert"]')).toBeNull();
    expect(count("/auth/complete")).toBe(1);
    expect(count("/auth/start")).toBe(1);
    expect(count("/auth/status")).toBe(0);
    expect(count("/refresh-models")).toBe(2);
  });
}

it("keeps recovery in a ready onboarding row and after leaving the first-run gate", async () => {
  surface = "onboarding";
  act(() => root.render(createElement(StoreProvider, null, createElement(Harness))));
  await tick();
  const row = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
  act(() => row.click());
  await begin();
  holdModels = true;
  await finish();
  const discovery = finishModels!;
  act(() => window.dispatchEvent(new Event("focus")));
  await tick();
  expect(container.textContent).toContain("Everything is ready. Your bots can start right away.");
  expect(container.querySelector("[data-claude-sign-in]")).toBeNull();
  expect(button("Checking…").disabled).toBe(true);
  discovery(Response.json({ error: "Private model failure" }, { status: 503 }));
  await tick();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(refreshWarning);
  surface = "shell";
  act(() => root.render(createElement(StoreProvider, null, createElement(Harness))));
  await tick();
  expect(container.querySelector('[data-sign-in-model-recoveries] [role="alert"]')?.textContent).toBe(refreshWarning);
  holdModels = false;
  act(() => button("Check again").click());
  await tick();
  expect(container.querySelector('[data-sign-in-model-recoveries]')).toBeNull();
  expect(count("/auth/start")).toBe(1);
  expect(count("/auth/complete")).toBe(1);
  expect(count("/auth/status")).toBe(0);
  expect(count("/refresh-models")).toBe(2);
});

it("coalesces discovery retries shared by two surfaces for the same confirmed login", async () => {
  modelsFailed = true;
  await begin();
  await finish();
  holdModels = true;
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => { first = store.refreshSignInModels("claude"); second = store.refreshSignInModels("claude"); });
  await tick();
  expect(first).toBe(second);
  expect(count("/refresh-models")).toBe(2);
  expect(button("Checking…").disabled).toBe(true);
  finishModels!(Response.json({ instances: inventory() }));
  await tick();
  await Promise.all([first, second]);
  expect(store.signInModelDiscovery.claude).toBeUndefined();
  expect(count("/auth/complete")).toBe(1);
});

it("clears recovery on a confirmed sign-out and cannot restore it from late discovery", async () => {
  await begin();
  holdModels = true;
  await finish();
  const discovery = finishModels!;
  authenticated = false;
  act(() => store.dispatch({ type: "instances", instances: inventory() }));
  await tick();
  expect(store.signInModelDiscovery.claude).toBeUndefined();
  discovery(Response.json({ error: "Private late failure" }, { status: 503 }));
  await tick();
  expect(store.signInModelDiscovery.claude).toBeUndefined();
  expect(card().querySelector('[data-sign-in-model-recovery]')).toBeNull();
  expect(count("/auth/complete")).toBe(1);
});

it("does not invent sign-in recovery for object-property instance names", async () => {
  authenticated = true;
  const instances = ["constructor", "__proto__", "toString"].map((instanceId) => ({ ...inventory()[0]!, instanceId }));
  act(() => store.dispatch({ type: "instances", instances }));
  await tick();
  expect(container.querySelector('[data-sign-in-model-recovery]')).toBeNull();
  surface = "shell";
  act(() => root.render(createElement(StoreProvider, null, createElement(Harness))));
  await tick();
  expect(container.querySelector('[data-sign-in-model-recoveries]')).toBeNull();
  expect(count("/auth/")).toBe(0);
  expect(count("/refresh-models")).toBe(0);
});

for (const pending of [false, true]) {
  it(`restores confirmed login after Settings reopens with ${pending ? "pending" : "failed"} discovery and stale inventory`, async () => {
    await begin();
    holdModels = pending;
    modelsFailed = !pending;
    await finish();
    expect(store.state.instances[0]?.snapshot.authenticated).toBe(false);
    surface = "closed";
    act(() => root.render(createElement(StoreProvider, null, createElement(Harness))));
    surface = "settings";
    act(() => root.render(createElement(StoreProvider, null, createElement(Harness))));
    await tick();
    (card() as HTMLDetailsElement).open = true;
    expect(card().textContent).toContain("Claude connected on this server");
    expect([...card().querySelectorAll("button")].some((el) => el.textContent?.trim() === "Sign in to Claude")).toBe(false);
    if (pending) {
      expect(button("Checking…").disabled).toBe(true);
      finishModels!(Response.json({ error: "Private model failure" }, { status: 503 }));
      await tick();
    }
    expect(card().querySelector('[role="alert"]')?.textContent).toBe(refreshWarning);
    holdModels = false;
    modelsFailed = false;
    act(() => button("Check again").click());
    await tick();
    expect(store.state.instances[0]?.snapshot.authenticated).toBe(true);
    expect(card().querySelector('[role="alert"]')).toBeNull();
    expect(count("/auth/start")).toBe(1);
    expect(count("/auth/complete")).toBe(1);
    expect(count("/auth/status")).toBe(0);
    expect(count("/refresh-models")).toBe(2);
  });
}

it("does not start discovery when confirmed completion arrives after Store teardown", async () => {
  await begin();
  act(() => { button("Finish sign-in").click(); root.unmount(); });
  await tick();
  expect(authenticated).toBe(true);
  expect(count("/auth/complete")).toBe(1);
  expect(count("/refresh-models")).toBe(0);
});

it("preserves the second confirmed login when an older account discovery returns stale inventory", async () => {
  includeSibling = true;
  await act(async () => { await store.refreshInstances({ fresh: true, reportFailure: true }); });
  (card("claude-secondary") as HTMLDetailsElement).open = true;
  await begin();
  holdModels = true;
  await finish();
  const earlierDiscovery = finishModels!;
  const earlierInventory = inventory();
  await begin("claude-secondary");
  holdSiblingModels = true;
  await finish("claude-secondary");
  expect(siblingAuthenticated).toBe(true);
  const laterDiscovery = finishSiblingModels!;
  earlierDiscovery(Response.json({ instances: earlierInventory }));
  await tick();
  expect(store.signInModelDiscovery["claude-secondary"]).toBe("checking");
  laterDiscovery(Response.json({ error: "Private second discovery failure" }, { status: 503 }));
  await tick();
  expect(store.signInModelDiscovery["claude-secondary"]).toBe("failed");
  expect(card("claude-secondary").querySelector('[role="alert"]')?.textContent).toBe(refreshWarning.replace("Claude signed", "Claude second signed"));
  expect([...card("claude-secondary").querySelectorAll("button")].some((el) => el.textContent?.trim() === "Sign in to Claude")).toBe(false);
  holdSiblingModels = false;
  act(() => button("Check again", "claude-secondary").click());
  await tick();
  expect(store.state.instances.every((instance) => instance.snapshot.authenticated)).toBe(true);
  expect(store.signInModelDiscovery["claude-secondary"]).toBeUndefined();
  expect(count("/auth/complete")).toBe(2);
  expect(count("/auth/start")).toBe(2);
  expect(count("/auth/status")).toBe(0);
});
