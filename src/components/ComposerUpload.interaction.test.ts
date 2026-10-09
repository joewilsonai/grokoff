// @vitest-environment happy-dom
// GrokOff: real Composer, attachment controls and keyed draft state; no app,
// provider, account or filesystem calls. Only transport/store dispatch and
// unrelated voice/role controls are synthetic.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";
import { UPLOAD_ATTEMPT_TIMEOUT_MS } from "@/lib/composer-attachments";
import { getDraft, getDraftAttachments, isDraftAttachmentPending, setDraft } from "@/lib/drafts";
import { setLocale } from "@/lib/i18n";
import { Composer } from "./Composer";

const fixture = vi.hoisted(() => ({ state: {} as Record<string, unknown>, dispatch: vi.fn() }));
vi.mock("@/state/store", async (original) => ({
  ...await original<typeof import("@/state/store")>(),
  useStore: () => ({ state: fixture.state, dispatch: fixture.dispatch }),
}));
vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => false }));
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => false }));
vi.mock("./CallView", () => ({ CallButton: () => null }));

let container: HTMLDivElement;
let root: Root;
let bot: Bot;
let draftId: string;
let sequence = 0;
let requests: Array<{ url: string; signal: AbortSignal }>;
let heldResponses: Array<{ url: string; resolve: (response: Response) => void }>;
let uploadMode: "held" | "body" | "mixed" | "success" | "refused";
const timeoutCopy = "Upload timed out. Check your connection and attach the file again.";
const tick = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const send = () => container.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!;
const pick = async (files: File[]) => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: files });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
  await tick();
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const preferences = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  setLocale("en");
  const id = `upload-fixture-${++sequence}`;
  bot = { id, threadId: `thread-${id}`, name: "Fixture", title: "", description: "", notifications: false,
    color: "green", unread: false, modelSelection: { instanceId: "claude", model: "claude-sonnet-5-5" }, messages: [] };
  draftId = `bot:${bot.id}:${bot.threadId}`;
  fixture.state = { bots: [bot], config: {}, instances: [{ instanceId: "claude", capabilities: { images: true } }], pendingQueued: {} };
  fixture.dispatch.mockReset();
  requests = [];
  heldResponses = [];
  uploadMode = "held";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method !== "POST" || !(url.startsWith("/api/files?") || url.startsWith("/api/attachments?"))) throw new Error(`Unexpected fixture request: ${url}`);
    requests.push({ url, signal: init.signal as AbortSignal });
    if (uploadMode === "held" || (uploadMode === "mixed" && url.includes("name=Bad.pdf"))) return new Promise<Response>(resolve => heldResponses.push({ url, resolve }));
    if (uploadMode === "body") return { status: 200, ok: true, json: () => new Promise(() => {}) } as Response;
    if (uploadMode === "refused") return new Response(JSON.stringify({ error: "You cannot upload files to this workspace." }), { status: 403 });
    const image = url.startsWith("/api/attachments?");
    return new Response(JSON.stringify({ path: `/private/attachments/11111111-1111-4111-8111-111111111111.${image ? "png" : "pdf"}`, name: "Brief.pdf", mime: "image/png", bytes: 9 }));
  }));
  setDraft(localStorage, draftId, "Keep my unsent draft");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Composer, { bot })));
  await tick();
  expect(send()).not.toBeNull();
  expect(send().disabled).toBe(false);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(["held", "body"] as const)("preserves the draft, clears final %s upload failure and allows re-selection and Send", async (mode) => {
  uploadMode = mode;
  const file = new File(["synthetic"], "Brief.pdf", { type: "application/pdf" });
  await pick([file]);
  expect(send().disabled).toBe(true);
  expect(isDraftAttachmentPending(draftId)).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(2 * UPLOAD_ATTEMPT_TIMEOUT_MS); });
  await tick();
  expect(container.textContent).toContain(`Brief.pdf: ${timeoutCopy}`);
  expect(send().disabled).toBe(false);
  expect(isDraftAttachmentPending(draftId)).toBe(false);
  expect(getDraft(localStorage, draftId)).toBe("Keep my unsent draft");
  expect(getDraftAttachments(localStorage, draftId)).toEqual([]);
  expect(requests).toHaveLength(2);
  expect(requests[0]!.url).toBe(requests[1]!.url);
  expect(requests.every(request => request.signal.aborted)).toBe(true);
  uploadMode = "success";
  await pick([file]);
  expect(container.textContent).not.toContain(timeoutCopy);
  expect(getDraftAttachments(localStorage, draftId)).toHaveLength(1);
  act(() => send().click());
  expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "send", botId: bot.id, threadId: bot.threadId,
    text: expect.stringContaining("Keep my unsent draft\n\n<attached-file") }));
  expect(getDraft(localStorage, draftId)).toBe("");
});

it("keeps Send blocked when an image chip is removed while another upload remains active", async () => {
  const image = new File(["synthetic"], "Shot.png", { type: "image/png" });
  const document = new File(["synthetic"], "Brief.pdf", { type: "application/pdf" });
  await pick([image]);
  await pick([document]);
  const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove file"]')!;
  expect(remove).not.toBeNull();
  act(() => remove.click());
  expect(getDraftAttachments(localStorage, draftId)).toEqual([]);
  expect(send().disabled).toBe(true);
  expect(isDraftAttachmentPending(draftId)).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(2 * UPLOAD_ATTEMPT_TIMEOUT_MS); });
  await tick();
  expect(send().disabled).toBe(false);
  expect(isDraftAttachmentPending(draftId)).toBe(false);
  expect(getDraft(localStorage, draftId)).toBe("Keep my unsent draft");
  expect(requests).toHaveLength(4);
});

it("shows a filename-specific permission refusal without retrying and keeps the draft usable", async () => {
  uploadMode = "refused";
  await pick([new File(["synthetic"], "Brief.pdf", { type: "application/pdf" })]);
  expect(container.textContent).toContain("Brief.pdf: You cannot upload files to this workspace.");
  expect(requests).toHaveLength(1);
  expect(send().disabled).toBe(false);
  expect(getDraft(localStorage, draftId)).toBe("Keep my unsent draft");
  act(() => send().click());
  expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "send", text: "Keep my unsent draft" }));
});


it("retains a completed attachment when another file in the selected batch times out", async () => {
  uploadMode = "mixed";
  await pick([new File(["synthetic"], "Brief.pdf", { type: "application/pdf" }), new File(["synthetic"], "Bad.pdf", { type: "application/pdf" })]);
  expect(send().disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(2 * UPLOAD_ATTEMPT_TIMEOUT_MS); });
  await tick();
  expect(container.textContent).toContain(`Bad.pdf: ${timeoutCopy}`);
  expect(getDraftAttachments(localStorage, draftId)).toEqual([expect.objectContaining({ kind: "file", name: "Brief.pdf" })]);
  expect(send().disabled).toBe(false);
  act(() => send().click());
  const sent = fixture.dispatch.mock.calls.find(([action]) => action.type === "send")![0];
  expect(sent.text).toContain('name="Brief.pdf"');
  expect(sent.text).not.toContain('name="Bad.pdf"');
});

it("names a pasted image when its bounded upload fails and clears Send blocking", async () => {
  const image = new File(["synthetic"], "Clipboard.png", { type: "image/png" });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: {
    files: [image], items: [{ kind: "file", type: image.type, getAsFile: () => image }], getData: () => "",
  } });
  act(() => container.querySelector("textarea")!.dispatchEvent(event));
  await tick();
  expect(send().disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(2 * UPLOAD_ATTEMPT_TIMEOUT_MS); });
  await tick();
  expect(fixture.dispatch).toHaveBeenCalledWith({ type: "error", message: `Clipboard.png: ${timeoutCopy}` });
  expect(send().disabled).toBe(false);
  expect(getDraftAttachments(localStorage, draftId)).toEqual([]);
  expect(getDraft(localStorage, draftId)).toBe("Keep my unsent draft");
});


it("retains another upload's later failure after a concurrent successful completion", async () => {
  await pick([new File(["synthetic"], "Bad.pdf", { type: "application/pdf" })]);
  await act(async () => { await vi.advanceTimersByTimeAsync(UPLOAD_ATTEMPT_TIMEOUT_MS); });
  await pick([new File(["synthetic"], "Brief.pdf", { type: "application/pdf" })]);
  await act(async () => { await vi.advanceTimersByTimeAsync(UPLOAD_ATTEMPT_TIMEOUT_MS); });
  await tick();
  expect(container.textContent).toContain(`Bad.pdf: ${timeoutCopy}`);
  expect(send().disabled).toBe(true);
  const healthy = heldResponses.filter(request => request.url.includes("name=Brief.pdf")).at(-1)!;
  healthy.resolve(new Response(JSON.stringify({ path: "/private/attachments/11111111-1111-4111-8111-111111111111.pdf", name: "Brief.pdf", bytes: 9 })));
  await tick();
  expect(send().disabled).toBe(false);
  expect(container.textContent).toContain(`Bad.pdf: ${timeoutCopy}`);
  expect(getDraftAttachments(localStorage, draftId)).toEqual([expect.objectContaining({ name: "Brief.pdf" })]);
});

it.each(["drop", "paste"] as const)("clears an earlier picker failure when a fresh %s begins", async (source) => {
  await pick([new File(["synthetic"], "Bad.pdf", { type: "application/pdf" })]);
  await act(async () => { await vi.advanceTimersByTimeAsync(2 * UPLOAD_ATTEMPT_TIMEOUT_MS); });
  await tick();
  expect(container.textContent).toContain(`Bad.pdf: ${timeoutCopy}`);
  const image = new File(["synthetic"], "Fresh.png", { type: "image/png" });
  const event = new Event(source === "drop" ? "drop" : "paste", { bubbles: true, cancelable: true });
  if (source === "drop") Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [image] } });
  else Object.defineProperty(event, "clipboardData", { value: { files: [image], items: [{ kind: "file", type: image.type, getAsFile: () => image }], getData: () => "" } });
  act(() => (source === "drop" ? window : container.querySelector("textarea")!).dispatchEvent(event));
  await tick();
  expect(container.textContent).not.toContain(timeoutCopy);
  expect(send().disabled).toBe(true);
  // Complete the synthetic upload; no native picker, clipboard or socket is used.
  heldResponses.at(-1)!.resolve(new Response(JSON.stringify({ path: "/private/attachments/11111111-1111-4111-8111-111111111111.png", mime: "image/png", bytes: 9 })));
  await tick();
  expect(send().disabled).toBe(false);
  expect(container.textContent).not.toContain(timeoutCopy);
});
