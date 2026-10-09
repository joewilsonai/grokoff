// @vitest-environment happy-dom
// Copyright 2026 Joe Wilson. SPDX-License-Identifier: Apache-2.0
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EMPTY_ONBOARDING, WELCOME_VERSION } from "@/lib/onboarding";
import { TOUR_STEPS } from "@/lib/guided-tour";

const fixture = vi.hoisted(() => ({ state: {} as Record<string, unknown>, dispatch: vi.fn(), api: vi.fn() }));
vi.mock("@/state/store", () => ({ useStore: () => ({ state: fixture.state, dispatch: fixture.dispatch }), api: fixture.api }));
vi.mock("./Spotlight", () => ({ Spotlight: ({ children, primary, secondary }: {
  children: import("react").ReactNode;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) => createElement("div", { role: "tooltip" }, children,
  createElement("button", { onClick: primary.onClick }, primary.label),
  secondary && createElement("button", { onClick: secondary.onClick }, secondary.label)) }));
import { GuidedTour } from "./GuidedTour";

let root: Root;
let container: HTMLDivElement;
const tick = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const render = async () => { await act(async () => root.render(createElement(GuidedTour))); await tick(); };
function record(step: string) {
  return { ...EMPTY_ONBOARDING, completedAt: "2026-10-09T00:00:00.000Z", version: WELCOME_VERSION,
    hintsSeen: ["spot.approval", ...TOUR_STEPS.slice(0, TOUR_STEPS.findIndex(s => s.id === step)).map(s => s.id)] };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  fixture.api.mockReset(); fixture.dispatch.mockReset();
  fixture.state = { config: { onboarding: record("tour.composer") }, welcomeOpen: false, tourOpen: true,
    appSettingsOpen: false, settingsOpen: false, computerOpen: false, pluginsOpen: false };
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

for (const modal of ["appSettingsOpen", "settingsOpen"]) {
  for (const step of ["tour.composer", "tour.computer-browser"]) it(`does not cover or reopen panels over ${modal} at ${step}`, async () => {
    fixture.state.config = { onboarding: record(step) }; fixture.state[modal] = true;
    const before = JSON.stringify(fixture.state.config);
    await render(); await act(async () => vi.advanceTimersByTimeAsync(1200));
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(fixture.api).not.toHaveBeenCalled(); expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.state.config)).toBe(before);
  });

  it(`pauses and resumes the same step around ${modal} without saving progress`, async () => {
    await render(); const copy = container.textContent; expect(container.querySelector('[role="tooltip"]')).not.toBeNull();
    const before = JSON.stringify(fixture.state.config);
    fixture.state[modal] = true; await render(); expect(container.querySelector('[role="tooltip"]')).toBeNull();
    fixture.state[modal] = false; await render(); expect(container.textContent).toBe(copy);
    expect(JSON.stringify(fixture.state.config)).toBe(before); expect(fixture.api).not.toHaveBeenCalled();
  });

  it(`rebuilds its own Apps panel after ${modal} closes without advancing the step`, async () => {
    fixture.state.config = { onboarding: record("tour.apps-panel") };
    await render(); expect(fixture.dispatch).toHaveBeenCalledWith({ type: "togglePlugins", open: true });
    fixture.dispatch.mockClear(); fixture.state[modal] = true; await render();
    expect(fixture.dispatch).not.toHaveBeenCalled();
    fixture.state[modal] = false; await render();
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "togglePlugins", open: true });
    expect(fixture.api).not.toHaveBeenCalled();
  });

  it(`does not reopen a computer panel when a pending Next finishes under ${modal}`, async () => {
    fixture.state.config = { onboarding: record("tour.computer") };
    let resolve!: (value: unknown) => void;
    fixture.api.mockImplementation(() => new Promise(r => { resolve = r; }));
    await render(); await act(async () => container.querySelector("button")!.click()); await tick();
    expect(fixture.api).toHaveBeenCalledTimes(1);
    fixture.state[modal] = true; await render();
    const next = { onboarding: record("tour.computer-browser") };
    await act(async () => resolve(next)); await tick();
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "configStatus", config: next });
    expect(fixture.dispatch).not.toHaveBeenCalledWith({ type: "toggleComputer", open: true });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    fixture.state.config = next; fixture.state[modal] = false; await render();
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "toggleComputer", open: true });
    expect(fixture.api).toHaveBeenCalledTimes(1);
  });
}

it("still saves an explicit Skip and leaves unrelated hints intact", async () => {
  fixture.api.mockResolvedValue({ onboarding: { ...record("tour.done"), hintsSeen: TOUR_STEPS.map(s => s.id) } });
  await render(); await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Skip tour")!.click()); await tick();
  const body = JSON.parse(fixture.api.mock.calls[0]![1].body);
  expect(body.onboarding.hintsSeen).toContain("spot.approval");
  expect(body.onboarding.hintsSeen).toEqual(expect.arrayContaining(TOUR_STEPS.map(s => s.id)));
  expect(fixture.dispatch).toHaveBeenCalledWith({ type: "toggleTour", open: false });
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
});
