// @vitest-environment happy-dom
// GrokOff: exercise actual key controls/API transport with disposable in-memory responses.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/state/store";
import { t } from "@/lib/i18n";
import { ApiKeyRow } from "./ApiKeys";

type Pending = { signal: AbortSignal; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
let fixture: ReturnType<typeof store.useStore>;
let probes: Pending[];
let heldSave: (() => void) | undefined;
let holdSave: boolean;
let requests: Array<{ path: string; method: string }>;

const tick = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};
const render = () => {
  if (mounted) root.render(createElement(ApiKeyRow, { section: "openai", testProvider: "openai" }));
};
const input = () => container.querySelector<HTMLInputElement>('input[type="password"]')!;
const button = (name: string) => Array.from(container.querySelectorAll("button")).find(candidate => candidate.textContent === name)!;
const change = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
  });
};
const save = async () => {
  await change("synthetic-fixture-key");
  await act(async () => {
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await tick();
  });
};
const finish = async (index: number, response: Response) => {
  await act(async () => { probes[index]!.resolve(response); await tick(); });
};

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
  holdSave = false;
  heldSave = undefined;
  probes = [];
  requests = [];
  const dispatch = vi.fn<ReturnType<typeof store.useStore>["dispatch"]>((action) => {
    if (action.type === "configStatus") {
      fixture.state.config = action.config;
      render();
    }
  });
  fixture = {
    state: { ...store.initialState, config: { openai: { configured: false } } as store.ConfigStatus },
    dispatch, flushBotPatches: vi.fn(), refreshInstances: vi.fn(), refreshModels: vi.fn(),
  };
  vi.spyOn(store, "useStore").mockReturnValue(fixture);
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    requests.push({ path, method: init.method ?? "GET" });
    if (path === "/api/config" && init.method === "PUT") {
      const configured = Boolean(JSON.parse(String(init.body)).openai.key);
      const response = () => Response.json({ openai: { configured } });
      if (!holdSave) return response();
      return new Promise<Response>(resolve => { heldSave = () => resolve(response()); });
    }
    if (path === "/api/keys/test" && init.method === "POST") {
      // Deliberately allow a response after abort, to exercise the real
      // generation guard as well as proving the owned signal was cancelled.
      return new Promise<Response>(resolve => probes.push({ signal: init.signal as AbortSignal, resolve }));
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  }));
  await act(async () => { render(); await tick(); });
});

afterEach(async () => {
  if (mounted) await act(async () => { root.unmount(); mounted = false; });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps the successful save configured when its model probe cannot reach the provider", async () => {
  await save();
  expect(fixture.state.config?.openai?.configured).toBe(true);
  expect(input().value).toBe("");
  await finish(0, Response.json({ ok: false, reason: "unreachable" }));
  expect(container.querySelector('[role="status"]')?.textContent).toContain(t("keys.testSaved"));
  expect(container.querySelector('[role="status"]')?.textContent).toContain(t("keys.testUnreachable"));
  expect(button(t("keys.test")).disabled).toBe(false);
});

for (const failed of [false, true]) it(`releases the invalidated probe when its late ${failed ? "HTTP failure" : "catalog result"} arrives`, async () => {
  await save();
  expect(button(t("keys.testing")).disabled).toBe(true);
  await change("unsaved-replacement");
  await change("");
  expect(probes[0]!.signal.aborted).toBe(true);
  expect(button(t("keys.test")).disabled).toBe(false);
  await finish(0, failed ? Response.json({ error: "Synthetic model discovery failure" }, { status: 503 })
    : Response.json({ ok: true, models: ["late-fixture-model"] }));
  expect(button(t("keys.test")).disabled).toBe(false);
  expect(container.querySelector(".animate-spin")).toBeNull();
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(fixture.state.config?.openai?.configured).toBe(true);
  expect(requests).toEqual([{ path: "/api/config", method: "PUT" }, { path: "/api/keys/test", method: "POST" }]);
});

it("does not let an old completion clear a newer probe's busy state or verdict", async () => {
  await save();
  await change("unsaved-replacement");
  await change("");
  await act(async () => { button(t("keys.test")).click(); await tick(); });
  expect(probes).toHaveLength(2);
  expect(probes[0]!.signal.aborted).toBe(true);
  expect(probes[1]!.signal.aborted).toBe(false);
  await finish(0, Response.json({ ok: true, models: ["stale-model"] }));
  expect(button(t("keys.testing")).disabled).toBe(true);
  expect(container.querySelector('[role="status"]')).toBeNull();
  await finish(1, Response.json({ ok: true, models: ["current-model"] }));
  expect(button(t("keys.test")).disabled).toBe(false);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("current-model");
  expect(container.textContent).not.toContain("stale-model");
});

it("cancels the probe when clearing the saved key without resurrecting its verdict", async () => {
  await save();
  await act(async () => { button(t("keys.clear")).click(); await tick(); });
  expect(fixture.state.config?.openai?.configured).toBe(false);
  expect(probes[0]!.signal.aborted).toBe(true);
  await finish(0, Response.json({ ok: true, models: ["removed-key-model"] }));
  expect(container.querySelector(".animate-spin")).toBeNull();
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.textContent).not.toContain("removed-key-model");
  expect(probes).toHaveLength(1);
});

it("aborts the owned model probe when the row unmounts", async () => {
  await save();
  await act(async () => { root.unmount(); mounted = false; });
  expect(probes[0]!.signal.aborted).toBe(true);
  await finish(0, Response.json({ ok: true, models: ["unmounted-model"] }));
  expect(probes).toHaveLength(1);
  expect(container.textContent).toBe("");
});

it("does not start an automatic probe after an unmounted row's save completes", async () => {
  holdSave = true;
  await save();
  expect(heldSave).toBeTypeOf("function");
  await act(async () => { root.unmount(); mounted = false; });
  await act(async () => { heldSave!(); await tick(); });
  expect(fixture.state.config?.openai?.configured).toBe(true);
  expect(probes).toHaveLength(0);
  expect(requests).toEqual([{ path: "/api/config", method: "PUT" }]);
});
