// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoreProvider, useStore, type InstanceInfo } from "@/state/store";
import { setLocale } from "@/lib/i18n";
import { MODEL_REFRESH_TIMEOUT_MS } from "@/state/instance-refresh";
import { ProviderAuthSessions } from "../../server/provider-auth-sessions";
import { EnginesSettings } from "./EnginesSettings";

// The real Settings, store, API helper and owner-scoped sign-in controller
// use synthetic transport and in-memory providers. No CLI or account is used.
vi.mock("@/lib/live-events", async (original) => ({
  ...await original<typeof import("@/lib/live-events")>(),
  openLiveEvents: (handlers: { onSnapshotRequired: () => Promise<boolean> }) => {
    queueMicrotask(() => void handlers.onSnapshotRequired());
    return () => {};
  },
}));
vi.mock("@/lib/app-links", async (original) => ({
  ...await original<typeof import("@/lib/app-links")>(),
  openExternalLink: vi.fn(async () => {}),
}));

const modes = ["codex", "grok", "chatgpt"] as const;
type Mode = typeof modes[number];
const startLabels = { codex: "Connect ChatGPT", grok: "Sign in to Grok", chatgpt: "Continue with ChatGPT" };
const displayNames = { codex: "Codex", grok: "Grok Build", chatgpt: "ChatGPT plan" };
const warning = (mode: Mode) => `${displayNames[mode]} signed in, but your connection and models couldn't be refreshed. Check again to retry.`;
let root: Root | undefined;
let container: HTMLDivElement;
let store: ReturnType<typeof useStore>;
let sessions: ProviderAuthSessions;
let authenticated: Set<Mode>;
let failModels: boolean;
let alreadySignedIn: boolean;
let rejectSignIn: boolean;
let holdModels: boolean;
let holdStatus: boolean;
let statusSignal: AbortSignal | undefined;
let finishStatus: ((response: Response) => void) | undefined;
let heldStatus: Response | undefined;
let modelsSignal: AbortSignal | undefined;
let finishModels: ((response: Response) => void) | undefined;
let requests: Array<{ path: string; method: string }>;
let unexpected: string[];
let showSettings: boolean;

const inventory = (): InstanceInfo[] => modes.map((mode) => ({
  instanceId: mode, driverKind: mode === "grok" ? "grokAgent" : "codex",
  cliDefault: mode === "grok" ? "grok" : "codex",
  displayName: displayNames[mode],
  access: "subscription", snapshot: { state: "available", authenticated: authenticated.has(mode), ...(authenticated.has(mode) ? { billing: "subscription" as const } : {}) },
  models: { default: mode === "grok" ? "grok-build" : "gpt-6.1-sol", options: [] },
  authentication: { method: mode === "chatgpt" ? "browser-pkce" : "device-code", signOut: true },
  install: { docsUrl: "https://fixture.invalid/provider" },
}));
const challenge = (mode: Mode) => ({
  phase: "waiting" as const, flowId: `fixture-${mode}-flow`,
  authorizationUrl: mode === "grok" ? "https://accounts.x.ai/device" : mode === "chatgpt"
    ? "https://auth.openai.com/api/accounts/authorize?state=fixture" : "https://auth.openai.com/codex/device",
  ...(mode === "chatgpt" ? {} : { userCode: mode === "grok" ? "WDJB-MJHT" : "ABCD-12345" }),
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
});
function Harness() { store = useStore(); return showSettings ? createElement(EnginesSettings) : null; }
const card = (mode: Mode) => container.querySelector(`[data-engine-card="${mode}"]`)!;
const button = (mode: Mode, label: string) => {
  const found = [...card(mode).querySelectorAll("button")].find((el) => el.textContent?.trim() === label);
  expect(found, `Expected ${mode} button: ${label}`).toBeDefined();
  return found!;
};
const tick = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const count = (suffix: string) => requests.filter(({ path }) => path.includes(suffix)).length;
async function begin(mode: Mode) {
  act(() => button(mode, startLabels[mode]).click());
  await tick();
}
async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); await tick(); }

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const preferences = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) });
  setLocale("en");
  sessions = new ProviderAuthSessions();
  authenticated = new Set();
  failModels = alreadySignedIn = holdModels = rejectSignIn = holdStatus = false;
  statusSignal = undefined; finishStatus = undefined; heldStatus = undefined;
  modelsSignal = undefined;
  finishModels = undefined;
  requests = []; unexpected = []; showSettings = true;
  const providers = new Map(modes.map((mode) => [mode, {
    instanceId: mode,
    startAuthentication: async () => {
      if (!alreadySignedIn) return challenge(mode);
      authenticated.add(mode);
      return { phase: "succeeded" as const, flowId: null, authorizationUrl: null, expiresAt: null };
    },
    getAuthentication: async () => {
      if (rejectSignIn) return { phase: "failed" as const, flowId: challenge(mode).flowId, authorizationUrl: null, expiresAt: null, message: "The provider declined this sign-in." };
      authenticated.add(mode);
      return { phase: "succeeded" as const, flowId: challenge(mode).flowId, authorizationUrl: null, expiresAt: null };
    },
  }]));
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push({ path, method });
    const match = path.match(/^\/api\/instances\/(codex|grok|chatgpt)\/(auth\/start|auth\/status\?|auth\/cancel|auth\/sign-out|refresh-models)/);
    if (match) {
      const mode = match[1] as Mode;
      if (match[2] === "auth/start" && method === "POST") return Response.json({ auth: await sessions.start(providers.get(mode)!, "fixture-owner") });
      if (match[2] === "auth/status?" && method === "GET") {
        const response = Response.json({ auth: await sessions.status(mode, "fixture-owner", new URL(path, "http://fixture.invalid").searchParams.get("flowId")!) });
        if (!holdStatus) return response;
        statusSignal = init?.signal ?? undefined;
        heldStatus = response;
        return new Promise<Response>((resolve) => { finishStatus = resolve; });
      }
      if (match[2] === "auth/cancel" && method === "POST") {
        await sessions.cancel(mode, "fixture-owner", JSON.parse(String(init?.body)).flowId);
        return Response.json({ ok: true });
      }
      if (match[2] === "auth/sign-out" && method === "POST") {
        authenticated.delete(mode);
        sessions.clear();
        return Response.json({ instances: inventory() });
      }
      if (match[2] === "refresh-models" && method === "POST") {
        modelsSignal = init?.signal ?? undefined;
        if (holdModels) return new Promise<Response>((resolve) => { finishModels = resolve; });
        return failModels ? Response.json({ error: "Private discovery failure" }, { status: 503 }) : Response.json({ instances: inventory() });
      }
    }
    if (path === "/api/instances" && method === "GET") return Response.json({ instances: inventory() });
    const bodies: Record<string, unknown> = {
      "/api/bots?messages=200": { bots: [], groups: [], sections: [] }, "/api/config": {},
      "/api/routines": { routines: [], runs: [] }, "/api/webhooks": { webhooks: [], ingress: { available: false, baseUrl: "" } }, "/api/live/call": {},
    };
    if (method === "GET" && Object.hasOwn(bodies, path)) return Response.json(bodies[path]);
    unexpected.push(`${method} ${path}`);
    return Response.json({ error: "Unexpected fixture request" }, { status: 500 });
  }));
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(StoreProvider, null, createElement(Harness))); });
  await tick();
  for (const mode of modes) (card(mode) as HTMLDetailsElement).open = true;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined; container?.remove(); sessions?.clear();
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  expect(unexpected).toEqual([]);
});

it.each(modes)("preserves %s poll success and retries only model discovery after failure", async (mode) => {
  failModels = true;
  await begin(mode); await poll();
  expect(authenticated.has(mode)).toBe(true);
  expect(card(mode).querySelector('[role="alert"]')?.textContent).toBe(warning(mode));
  expect(card(mode).textContent).not.toContain("models are being refreshed");
  expect(card(mode).textContent).not.toContain("Private discovery");
  expect(card(mode).querySelector("code")).toBeNull();
  const authCalls = count("/auth/");
  failModels = false;
  act(() => button(mode, "Check again").click()); await tick();
  expect(card(mode).querySelector('[role="alert"]')).toBeNull();
  expect(store.state.instances.find((i) => i.instanceId === mode)?.snapshot.authenticated).toBe(true);
  expect(count("/auth/")).toBe(authCalls);
  expect(count("/refresh-models")).toBe(2);
});

it.each(modes)("keeps an already-confirmed %s startup retryable after model discovery failure", async (mode) => {
  alreadySignedIn = failModels = true;
  await begin(mode);
  expect(card(mode).querySelector('[role="alert"]')?.textContent).toBe(warning(mode));
  expect(count("/auth/status")).toBe(0);
  failModels = false;
  act(() => button(mode, "Check again").click()); await tick();
  expect(count("/auth/start")).toBe(1);
  expect(count("/refresh-models")).toBe(2);
  expect(store.state.instances.find((i) => i.instanceId === mode)?.snapshot.authenticated).toBe(true);
});

it("bounds stalled discovery and ignores its late success without starting another login", async () => {
  holdModels = true;
  await begin("codex"); await poll();
  expect(button("codex", "Checking…").disabled).toBe(true);
  const late = finishModels!;
  await act(async () => { await vi.advanceTimersByTimeAsync(MODEL_REFRESH_TIMEOUT_MS); }); await tick();
  expect(modelsSignal?.aborted).toBe(true);
  expect(card("codex").querySelector('[role="alert"]')?.textContent).toBe(warning("codex"));
  late(Response.json({ instances: inventory() })); await tick();
  expect(card("codex").querySelector('[role="alert"]')?.textContent).toBe(warning("codex"));
  holdModels = false;
  act(() => button("codex", "Check again").click()); await tick();
  expect(count("/auth/start")).toBe(1);
  expect(count("/auth/status")).toBe(1);
  expect(card("codex").querySelector('[role="alert"]')).toBeNull();
});

it("keeps a rejected device login distinct from model discovery failure", async () => {
  rejectSignIn = true;
  await begin("codex"); await poll();
  expect(authenticated.has("codex")).toBe(false);
  expect(card("codex").textContent).toContain("The provider declined this sign-in.");
  expect(card("codex").querySelector("[data-sign-in-model-recovery]")).toBeNull();
  expect(count("/refresh-models")).toBe(0);
  expect(card("codex").querySelector("[data-device-sign-in] button")).not.toBeNull();
});

it.each(modes)("retains %s model recovery after focus removes the completed sign-in card", async (mode) => {
  holdModels = true;
  await begin(mode); await poll();
  const finish = finishModels!;
  await act(async () => { window.dispatchEvent(new Event("focus")); }); await tick();
  expect(store.state.instances.find((i) => i.instanceId === mode)?.snapshot.authenticated).toBe(true);
  expect(card(mode).querySelector("[data-device-sign-in]")).toBeNull();
  expect(button(mode, "Checking…").disabled).toBe(true);
  finish(Response.json({ error: "Private discovery failure" }, { status: 503 })); await tick();
  expect(card(mode).querySelector('[role="alert"]')?.textContent).toBe(warning(mode));
  holdModels = false;
  act(() => button(mode, "Check again").click()); await tick();
  expect(card(mode).querySelector('[role="alert"]')).toBeNull();
  expect(count("/auth/start")).toBe(1);
  expect(count("/auth/status")).toBe(1);
});

it.each(["checking", "failed"] as const)("does not replay sign-in when Settings reopens during %s discovery", async (phase) => {
  holdModels = true;
  await begin("codex"); await poll();
  const finish = finishModels!;
  if (phase === "failed") {
    finish(Response.json({ error: "Private discovery failure" }, { status: 503 })); await tick();
  }
  const authCalls = count("/auth/");
  showSettings = false;
  await act(async () => { root!.render(createElement(StoreProvider, null, createElement(Harness))); });
  expect(container.querySelector("[data-engine-card]")).toBeNull();
  showSettings = true;
  await act(async () => { root!.render(createElement(StoreProvider, null, createElement(Harness))); }); await tick();
  expect(store.state.instances.find((i) => i.instanceId === "codex")?.snapshot.authenticated).toBe(false);
  expect(card("codex").textContent).toContain("ChatGPT connected on this server");
  expect([...card("codex").querySelectorAll("button")].some((el) => el.textContent?.trim() === startLabels.codex)).toBe(false);
  expect(count("/auth/")).toBe(authCalls);
  if (phase === "checking") {
    expect(button("codex", "Checking…").disabled).toBe(true);
    finish(Response.json({ error: "Private discovery failure" }, { status: 503 })); await tick();
  }
  expect(card("codex").querySelector('[role="alert"]')?.textContent).toBe(warning("codex"));
  holdModels = false;
  act(() => button("codex", "Check again").click()); await tick();
  expect(card("codex").querySelector('[role="alert"]')).toBeNull();
  expect(count("/auth/")).toBe(authCalls);
});

it.each((["codex", "chatgpt"] as const).flatMap((mode) => ["failed", "succeeded"].map((result) => ({ mode, result }))))("returns $mode to explicit sign-in after Settings sign-out and late $result discovery", async ({ mode, result }) => {
  holdModels = true;
  await begin(mode); await poll();
  const late = finishModels!;
  // A quiet inventory response exposes the actual account management panel
  // while discovery remains pending in its stable parent.
  await act(async () => { window.dispatchEvent(new Event("focus")); }); await tick();
  expect(button(mode, "Checking…").disabled).toBe(true);
  const staleInventory = inventory();
  act(() => button(mode, "Sign out of ChatGPT").click()); await tick();
  const confirm = [...document.querySelector('[role="alertdialog"]')!.querySelectorAll("button")]
    .find((el) => el.textContent?.trim() === "Sign out of ChatGPT")!;
  act(() => confirm.click()); await tick();
  expect(count("/auth/sign-out")).toBe(1);
  expect(authenticated.has(mode)).toBe(false);
  expect(store.signInModelDiscovery[mode]).toBeUndefined();
  expect(button(mode, startLabels[mode]).disabled).toBe(false);
  const before = count("/api/instances");
  late(result === "failed" ? Response.json({ error: "Private stale discovery failure" }, { status: 503 }) : Response.json({ instances: staleInventory })); await tick();
  if (result === "succeeded") expect(count("/api/instances")).toBe(before + 1);
  expect(store.state.instances.find((i) => i.instanceId === mode)?.snapshot.authenticated).toBe(false);
  expect(card(mode).querySelector('[data-sign-in-model-recovery]')).toBeNull();
  expect(card(mode).querySelector('[role="alert"]')).toBeNull();
  expect(count("/auth/start")).toBe(1);
  holdModels = false;
  await begin(mode);
  expect(count("/auth/start")).toBe(2);
  expect(card(mode).querySelector('[data-device-sign-in]')).not.toBeNull();
});

it.each(modes.flatMap((mode) => ["cancel", "close"].map((action) => ({ mode, action }))))("aborts held $mode status after $action and ignores late success", async ({ mode, action }) => {
  holdStatus = true;
  await begin(mode); await poll();
  const late = finishStatus!;
  expect(statusSignal?.aborted).toBe(false);
  expect(heldStatus).toBeDefined();
  expect(count("/refresh-models")).toBe(0);
  if (action === "cancel") {
    act(() => button(mode, "Cancel sign-in").click()); await tick();
    expect(count("/auth/cancel")).toBe(1);
    expect(card(mode).textContent).toContain("Sign-in cancelled");
  } else {
    showSettings = false;
    await act(async () => { root!.render(createElement(StoreProvider, null, createElement(Harness))); });
    expect(container.querySelector('[data-engine-card]')).toBeNull();
  }
  expect(statusSignal?.aborted).toBe(true);
  late(heldStatus!); await tick();
  expect(count("/refresh-models")).toBe(0);
  expect(store.signInModelDiscovery[mode]).toBeUndefined();
  expect(count("/auth/start")).toBe(1);
  if (action === "cancel") {
    expect(card(mode).textContent).toContain("Sign-in cancelled");
    expect(button(mode, "Try again").disabled).toBe(false);
  }
});
