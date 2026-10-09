// @vitest-environment happy-dom
// GrokOff (2026-10-09): real report-reader state, inert DOM snapshot and owned
// PDF cancellation against in-memory transports; no native/filesystem calls.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi, type Mock } from "vitest";
import { setLocale } from "@/lib/i18n";
import { createRequire } from "node:module";
import { ReportFileButton } from "./ReportFilePreview";

type ExportRequest = Parameters<NonNullable<NonNullable<Window["ogb"]>["exportReportPdf"]>>[0];
const message = { threadId: "synthetic-thread", messageId: "synthetic-message" };
const { reportPdfArticle } = createRequire(import.meta.url)("../../electron/report-pdf.mjs") as { reportPdfArticle(content: ReportPdfNode): string };
const path = "/owned/report.md";
const report = (text = "# Synthetic findings\n\n[Source](https://example.test/source)\n\n![Tracking image](https://example.test/pixel)") => new Response(text, { headers: { "content-type": "text/markdown" } });
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let root: Root, container: HTMLDivElement, unrelated: HTMLDivElement;
let originalBridge: Window["ogb"];
let fetch: Mock<typeof globalThis.fetch>;
let exportPdf: Mock<(request: ExportRequest) => Promise<"saved" | "cancelled">>;
let cancelPdf: Mock<(id: string) => Promise<boolean>>;
const tick = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.getAttribute("aria-label") === label || element.textContent?.trim() === label)!;
const pdfButton = () => button("Save PDF");
const open = async () => { act(() => button("Open report: report.md").click()); await tick(); };
const clickPdf = async () => { act(() => pdfButton().click()); await tick(); };

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLocale("en");
  originalBridge = window.ogb;
  exportPdf = vi.fn<(request: ExportRequest) => Promise<"saved" | "cancelled">>(async () => "saved");
  cancelPdf = vi.fn<(id: string) => Promise<boolean>>(async () => true);
  window.ogb = { exportReportPdf: exportPdf, cancelReportPdf: cancelPdf } as unknown as Window["ogb"];
  fetch = vi.fn<typeof globalThis.fetch>(async () => report());
  vi.stubGlobal("fetch", fetch);
  container = document.createElement("div"); document.body.append(container);
  unrelated = document.createElement("div"); unrelated.textContent = "PRIVATE_OTHER_CHAT_SENTINEL"; document.body.append(unrelated);
  root = createRoot(container);
  await act(async () => root.render(createElement(ReportFileButton, { path, name: "report.md", message })));
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); unrelated.remove();
  window.ogb = originalBridge;
  vi.unstubAllGlobals();
  expect(document.querySelector("dialog")).toBeNull();
});

it("enables PDF only after the current message-authorized report is committed", async () => {
  const wait = deferred<Response>(); fetch.mockReturnValueOnce(wait.promise);
  await open();
  expect(pdfButton().disabled).toBe(true);
  act(() => pdfButton().click()); expect(exportPdf).not.toHaveBeenCalled();
  wait.resolve(report()); await tick();
  expect(pdfButton().disabled).toBe(false);
  await clickPdf();
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("/api/threads/synthetic-thread/messages/synthetic-message/file");
  expect(JSON.parse(String(init?.body))).toEqual({ path });
  const sent = exportPdf.mock.calls[0]![0];
  expect(Object.keys(sent).sort()).toEqual(["content", "id", "name"]);
  expect(sent.name).toBe("report.md"); expect(sent.content.tag).toBe("article");
  const snapshot = JSON.stringify(sent.content);
  expect(snapshot).toContain("Synthetic findings"); expect(snapshot).toContain("https://example.test/source");
  expect(snapshot).not.toContain("PRIVATE_OTHER_CHAT_SENTINEL");
  expect(snapshot).not.toContain('"tag":"img"'); expect(snapshot).not.toContain("https://example.test/pixel");
  expect(document.querySelector('[role="status"]')?.textContent).toBe("PDF saved.");
});

it("hides PDF where the local cancellable native capability is absent", async () => {
  window.ogb = undefined;
  await open();
  expect(pdfButton()).toBeUndefined(); expect(button("Download report")).toBeDefined();
  expect(document.querySelector('[data-testid="report-content"]')).not.toBeNull();
});

it("keeps failed and empty reports unexportable while successful Retry becomes actionable", async () => {
  fetch.mockResolvedValueOnce(new Response("synthetic refusal", { status: 503 }));
  await open(); expect(pdfButton().disabled).toBe(true); expect(exportPdf).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(report(""));
  act(() => button("Retry").click()); await tick();
  expect(pdfButton().disabled).toBe(true); expect(document.querySelector("dialog")?.textContent).toContain("This report is empty.");
  act(() => button("Close report").click()); await tick();
  await open(); expect(pdfButton().disabled).toBe(false); await clickPdf(); expect(exportPdf).toHaveBeenCalledOnce();
});

it("native cancellation stays quiet and a new click gets a fresh job ID", async () => {
  exportPdf.mockResolvedValueOnce("cancelled");
  await open(); await clickPdf();
  expect(document.querySelector('[role="status"]')).toBeNull();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await clickPdf();
  expect(exportPdf).toHaveBeenCalledTimes(2);
  expect(exportPdf.mock.calls[0]![0].id).not.toBe(exportPdf.mock.calls[1]![0].id);
});

it("cancels only its pending job and ignores an old result while the reopened report saves", async () => {
  const old = deferred<"saved" | "cancelled">(), newer = deferred<"saved" | "cancelled">();
  exportPdf.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
  await open(); await clickPdf();
  const oldId = exportPdf.mock.calls[0]![0].id;
  expect(pdfButton().disabled).toBe(true);
  act(() => pdfButton().click()); expect(exportPdf).toHaveBeenCalledOnce();
  act(() => button("Close report").click()); await tick();
  expect(cancelPdf).toHaveBeenCalledExactlyOnceWith(oldId);
  await open(); await clickPdf();
  old.resolve("saved"); await tick();
  expect(pdfButton().disabled).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toBe("Creating PDF…");
  newer.resolve("saved"); await tick(); expect(pdfButton().disabled).toBe(false);
  expect(document.querySelector('[role="status"]')?.textContent).toBe("PDF saved.");
});

it("replacing the stored message closes the reader and cancels its exact export", async () => {
  const wait = deferred<"saved" | "cancelled">(); exportPdf.mockReturnValueOnce(wait.promise);
  await open(); await clickPdf();
  const id = exportPdf.mock.calls[0]![0].id;
  await act(async () => root.render(createElement(ReportFileButton, { path, name: "report.md", message: { ...message, messageId: "next-message" } })));
  expect(document.querySelector("dialog")).toBeNull(); expect(cancelPdf).toHaveBeenCalledExactlyOnceWith(id);
  wait.reject(new Error("pdf-timeout")); await tick();
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it.each(["pdf-timeout", "pdf-size", "pdf-destination", "pdf-filesystem", "pdf-busy", "unknown fixture exception"])("shows recovery for %s without re-reading or widening the file grant", async (reason) => {
  exportPdf.mockRejectedValueOnce(new Error(reason));
  await open(); await clickPdf();
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/Try again|try again|instead/);
  expect(document.querySelector('[role="alert"]')?.textContent).not.toContain("unknown fixture exception");
  if (reason === "pdf-filesystem") expect(document.querySelector('[role="alert"]')?.textContent).toContain("local Mac folder");
  expect(pdfButton().disabled).toBe(false);
  await clickPdf(); expect(exportPdf).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledOnce();
});

it("rejects an excessively nested actual Markdown snapshot before any native export", async () => {
  fetch.mockResolvedValueOnce(report(`${"> ".repeat(70)}Deep synthetic note`));
  await open(); await clickPdf();
  expect(exportPdf).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("too large for PDF export");
});

it("exports the reader's actual GFM footnote markup through the main allowlist", async () => {
  fetch.mockResolvedValueOnce(report("A research finding[^proof].\n\n[^proof]: Footnote evidence with **context**."));
  exportPdf.mockImplementationOnce(async (sent) => {
    const html = reportPdfArticle(sent.content);
    expect(html).toContain("<sup>"); expect(html).toContain("<section>");
    expect(html).toContain("Footnote evidence with <strong>context</strong>");
    expect(html).not.toContain('href="#');
    return "saved";
  });
  await open();
  expect(document.querySelector("article sup")).not.toBeNull(); expect(document.querySelector("article section")).not.toBeNull();
  await clickPdf();
  expect(document.querySelector('[role="status"]')?.textContent).toBe("PDF saved.");
});
