// @vitest-environment happy-dom
// Real React disclosure and run-log projection; network access is forbidden.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/state/store";
import { timelineEvents, runLogText } from "@/lib/taskTimeline";
import { ToolActivity } from "./ToolActivity";
import { RunLog } from "./RunLog";

let host: HTMLDivElement;
let root: Root;
const network = vi.fn(() => Promise.reject(new Error("No fixture network calls allowed")));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", network);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  expect(network).not.toHaveBeenCalled(); network.mockClear(); vi.unstubAllGlobals();
});
const renderTool = async (tool: NonNullable<Message["tool"]>) => act(async () => root.render(createElement(ToolActivity, { tool })));

describe("interrupted tool disclosure", () => {
  it("updates an open running disclosure to an honest interrupted receipt without discarding its input", async () => {
    const tool = { name: "browser.get_text", input: "main", itemId: "owned" };
    await renderTool(tool);
    expect(host.querySelector("summary")?.getAttribute("aria-label")).toContain("Running");
    const details = host.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(host.querySelector("summary")?.getAttribute("aria-expanded")).toBe("true");
    await renderTool({ ...tool, interrupted: true });
    expect(details.open).toBe(true);
    expect(host.querySelector("summary")?.getAttribute("aria-label")).toContain("Interrupted");
    expect(host.textContent).toContain("Check what happened before repeating the action");
    expect(host.querySelector("pre")?.textContent).toBe("main");
    expect(host.querySelectorAll("pre")).toHaveLength(1);
    expect(host.textContent).not.toContain("Waiting for the tool");
    expect(host.querySelector('[class*="animate-"]')).toBeNull();
  });

  it.each([true, false])("preserves a proven outcome %s even on an older row with an interruption marker", async ok => {
    await renderTool({ name: "Read", interrupted: true, ok, output: "Recorded original bytes" });
    expect(host.querySelector("summary")?.getAttribute("aria-label")).toContain(ok ? "Completed" : "Failed");
    expect(host.textContent).toContain("Recorded original bytes");
    expect(host.textContent).not.toContain("Check what happened");
  });

  it("uses the recorded interruption instead of guessing failure from a command title", async () => {
    const events = timelineEvents([{ id: "command", role: "bot", kind: "activity", at: 1,
      tool: { name: "error: a command title, not a result", interrupted: true } }]);
    expect(events[0]?.state).toBe("interrupted");
    await act(async () => root.render(createElement(RunLog, { events })));
    expect(host.textContent).toContain("Interrupted");
    expect(host.textContent).not.toContain("Failed");
  });

  it("projects interrupted, still-running, failed and completed receipts independently in the actual run log", async () => {
    const events = timelineEvents([
      { id: "stopped", role: "bot", kind: "activity", at: 1, tool: { name: "browser.get_text", interrupted: true } },
      { id: "pending", role: "bot", kind: "activity", at: 2, tool: { name: "Read" } },
      { id: "failed", role: "bot", kind: "activity", at: 3, tool: { name: "Read", ok: false, interrupted: true } },
      { id: "complete", role: "bot", kind: "activity", at: 4, tool: { name: "Read", ok: true, interrupted: true } },
    ]);
    expect(events.map(event => event.state)).toEqual(["interrupted", "running", "failed", "complete"]);
    await act(async () => root.render(createElement(RunLog, { events })));
    const rows = host.querySelectorAll("li");
    expect(rows[0]?.textContent).toContain("Interrupted");
    expect(rows[0]?.textContent).toContain("Check what happened");
    expect(rows[0]?.querySelector(".animate-spin")).toBeNull();
    expect(rows[1]?.querySelector(".animate-spin")).not.toBeNull();
    expect(rows[1]?.textContent).toContain("In progress");
    expect(rows[2]?.textContent).toContain("Failed");
    expect(rows[3]?.textContent).toContain("Completed");
    expect(runLogText(events)).toContain("interrupted · browser.get_text");
    expect(runLogText(events)).not.toContain("undone");
  });
});
