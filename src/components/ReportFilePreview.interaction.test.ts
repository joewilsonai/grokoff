// @vitest-environment happy-dom
// GrokOff: real report button/dialog state with synthetic message-file transport.
// No server, provider, file system, credentials or native desktop calls.
import { StrictMode, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { setLocale } from "@/lib/i18n";
import { ReportFileButton } from "./ReportFilePreview";

const DEADLINE_MS = 30_000;
const timeoutCopy = "Opening this report took too long. Check your connection and try again, or download the original.";
const message = { threadId: "synthetic-thread", messageId: "synthetic-message" };
const path = "/synthetic-workspace/Findings.md";
let root: Root;
let container: HTMLDivElement;
let mode: "headers" | "body" | "error-body" | "success" | "failure";
let requests: Array<{ url: string; init: RequestInit; signal: AbortSignal }>;
let held: Array<(response: Response) => void>;
let canceled: Mock<() => void>;
const report = (text = "# Recovered findings") => new Response(text, { headers: { "content-type": "text/markdown" } });
const tick = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const dialog = () => document.querySelector<HTMLDialogElement>("dialog")!;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.getAttribute("aria-label") === label || el.textContent?.trim() === label)!;
const open = async () => { act(() => button("Open report: Findings.md").click()); await tick(); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await tick(); };

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLocale("en");
  requests = [];
  held = [];
  canceled = vi.fn<() => void>();
  mode = "headers";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toMatch(/^\/api\/threads\/synthetic-thread\/messages\/synthetic-message(?:-next)?\/file$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ path });
    requests.push({ url, init, signal: init.signal as AbortSignal });
    if (mode === "headers") return new Promise<Response>((resolve) => { held.push(resolve); });
    if (mode === "body" || mode === "error-body") return new Response(new ReadableStream<Uint8Array>({ cancel: canceled }), {
      status: mode === "error-body" ? 503 : 200,
      headers: { "content-type": mode === "error-body" ? "application/json" : "text/markdown" },
    });
    if (mode === "failure") return new Response(JSON.stringify({ error: "Synthetic refusal" }), { status: 503 });
    return report();
  }));
  // happy-dom provides the dialog methods; these assertions keep the fixture
  // from silently testing a div instead of the production modal component.
  expect(typeof HTMLDialogElement.prototype.showModal).toBe("function");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(ReportFileButton, { path, name: "Findings.md", message })); });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  expect(document.querySelector("dialog")).toBeNull();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(["headers", "body", "error-body"] as const)("ends a stalled %s preview with a visible timeout and manual retry", async (stalled) => {
  mode = stalled;
  await open();
  expect(dialog().open).toBe(true);
  expect(dialog().querySelector('[role="status"]')?.textContent).toContain("Opening report");
  await advance(DEADLINE_MS - 1);
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
  await advance(1);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.signal.aborted).toBe(true);
  expect(dialog().open).toBe(true);
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(timeoutCopy);
  expect(button("Retry").disabled).toBe(false);
  expect(button("Download report").disabled).toBe(false);
  if (stalled === "body") expect(canceled).toHaveBeenCalledOnce();
  await advance(DEADLINE_MS);
  expect(requests).toHaveLength(1);
});

it("retries the same message grant and ignores late transport from the timed-out attempt", async () => {
  await open();
  await advance(DEADLINE_MS);
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(timeoutCopy);
  mode = "success";
  act(() => button("Retry").click());
  await tick();
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
  expect(dialog().querySelector("h1")?.textContent).toBe("Recovered findings");
  expect(requests).toHaveLength(2);
  expect(requests.map(({ url }) => url)).toEqual(Array(2).fill(`/api/threads/${message.threadId}/messages/${message.messageId}/file`));
  const obsoleteCancel = vi.fn();
  held[0]!(new Response(new ReadableStream({ cancel: obsoleteCancel }), { headers: { "content-type": "text/markdown" } }));
  await tick();
  expect(obsoleteCancel).toHaveBeenCalledOnce();
  expect(dialog().querySelector("h1")?.textContent).toBe("Recovered findings");
  await advance(DEADLINE_MS);
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
  expect(requests).toHaveLength(2);
});

it.each(["headers", "body"] as const)("closes a held %s preview quietly and reopens with a fresh attempt", async (stalled) => {
  mode = stalled;
  await open();
  act(() => button("Close report").click());
  await tick();
  expect(document.querySelector("dialog")).toBeNull();
  expect(requests[0]!.signal.aborted).toBe(true);
  if (stalled === "body") expect(canceled).toHaveBeenCalledOnce();
  await advance(DEADLINE_MS);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  mode = "success";
  await open();
  expect(dialog().querySelector("h1")?.textContent).toBe("Recovered findings");
  if (stalled === "headers") { held[0]!(report("# Obsolete report")); await tick(); }
  expect(dialog().querySelector("h1")?.textContent).toBe("Recovered findings");
  expect(requests).toHaveLength(2);
});

it("keeps one total deadline across delayed response headers and body decoding", async () => {
  await open();
  await advance(20_000);
  held[0]!(new Response(new ReadableStream({ cancel: canceled }), { headers: { "content-type": "text/markdown" } }));
  await tick();
  await advance(9_999);
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
  await advance(1);
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(timeoutCopy);
  expect(canceled).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(1);
});

it("isolates a changed message identity from an obsolete report request", async () => {
  await open();
  await act(async () => { root.render(createElement(ReportFileButton, { path, name: "Findings.md", message: { ...message, messageId: "synthetic-message-next" } })); });
  await tick();
  expect(document.querySelector("dialog")).toBeNull();
  expect(requests[0]!.signal.aborted).toBe(true);
  mode = "success";
  await open();
  held[0]!(report("# Obsolete report"));
  await tick();
  expect(dialog().querySelector("h1")?.textContent).toBe("Recovered findings");
  expect(requests[1]!.url).toContain("/synthetic-message-next/file");
  await advance(DEADLINE_MS);
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
});

it("clears the deadline after success or ordinary failure without automatic retries", async () => {
  mode = "failure";
  await open();
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("Could not open this report");
  await advance(DEADLINE_MS);
  expect(dialog().querySelector('[role="alert"]')?.textContent).not.toBe(timeoutCopy);
  expect(requests).toHaveLength(1);
  mode = "success";
  act(() => button("Retry").click());
  await tick();
  expect(dialog().querySelector("h1")?.textContent).toBe("Recovered findings");
  await advance(DEADLINE_MS);
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
  expect(requests).toHaveLength(2);
});

// The source entry mounts App in StrictMode. Its effect replay must close only
// the temporary modal instance, without treating that cleanup as user dismissal.
it.each(["Close report", "Escape"])("keeps the StrictMode reader open until explicit %s", async (dismissal) => {
  await act(async () => { root.render(createElement(StrictMode, null, createElement(ReportFileButton, { path, name: "Findings.md", message }))); });
  await open();
  expect(dialog()).not.toBeNull();
  expect(dialog().open).toBe(true);
  const currentRequest = requests.at(-1)!;
  expect(currentRequest.signal.aborted).toBe(false);
  expect(button("Open report: Findings.md")).toBeDefined();
  act(() => {
    if (dismissal === "Escape") dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
    else button("Close report").click();
  });
  await tick();
  expect(document.querySelector("dialog")).toBeNull();
  expect(currentRequest.signal.aborted).toBe(true);
  expect(document.activeElement).toBe(button("Open report: Findings.md"));
  // Late bodies from replayed or dismissed attempts cannot reopen the reader.
  for (const resolve of held) resolve(report("# Dismissed findings"));
  await tick();
  await advance(DEADLINE_MS);
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  mode = "success";
  await open();
  expect(dialog().open).toBe(true);
  expect(dialog().querySelector("h1")?.textContent).toBe("Recovered findings");
});
