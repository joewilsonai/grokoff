import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AttachedFileChip } from "./AttachmentPreview";
import { ChatMarkdown } from "./ChatMarkdown";
import {
  REPORT_PREVIEW_MAX_BYTES,
  ReportMarkdown,
  isMarkdownReport,
  readReportResponse,
  reportSourceUrl,
} from "./ReportFilePreview";

const message = { threadId: "thread-1", messageId: "message-1" };
const encode = (value: string) => new TextEncoder().encode(value);

describe("report entry points", () => {
  it("offers a lazy preview from the linked report and its file chip", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const chat = renderToStaticMarkup(createElement(ChatMarkdown, {
        text: "[Read the report](/workspace/report.md)", message,
      }));
      const chip = renderToStaticMarkup(createElement(AttachedFileChip, {
        file: { path: "/workspace/report.md", name: "report.md", private: false }, message, linked: true,
      }));
      for (const html of [chat, chip]) {
        expect(html).toContain('aria-label="Open report: report.md"');
        expect(html).not.toContain("<dialog");
      }
      expect(chat).toContain("Save a copy");
      expect(chip).toContain("Save a copy of report.md");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it("does not enable a report without a stored message or based on a disguised label", () => {
    const legacy = renderToStaticMarkup(createElement(ChatMarkdown, {
      text: "[Read the report](/workspace/report.md)",
    }));
    const disguised = renderToStaticMarkup(createElement(AttachedFileChip, {
      file: { path: "/workspace/payload.exe", name: "report.md", private: true }, message,
    }));
    expect(legacy).not.toContain("Open report");
    expect(disguised).not.toContain("Open report");
    expect(isMarkdownReport("/work/report%20final.MD#notes")).toBe(true);
    expect(isMarkdownReport("/work/report.md%3F.exe")).toBe(false);
    expect(isMarkdownReport("/work/%broken.md")).toBe(false);
  });
});

describe("report rendering authority", () => {
  it("renders useful Markdown and web citations while keeping executable content inert", () => {
    const html = renderToStaticMarkup(createElement(ReportMarkdown, { text: [
      "# Findings",
      "- A useful finding with **evidence**.",
      "| Source | Result |\n| --- | --- |\n| A | Verified |",
      "[Citation](https://example.test/source?q=research)",
      '<script>window.reportExecuted = true</script>',
      "[Run](javascript:alert%281%29)",
      '<iframe src="https://example.test/embed"></iframe>',
    ].join("\n\n") }));
    expect(html).toContain("<h1>Findings</h1>");
    expect(html).toContain("<strong>evidence</strong>");
    expect(html).toContain("<table");
    expect(html).toContain('href="https://example.test/source?q=research"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('href="javascript:');
  });

  it("grants no file capabilities to linked reports, images, or embedded app links", () => {
    const html = renderToStaticMarkup(createElement(ReportMarkdown, { text: [
      "[Secret](/private/credentials.md)",
      "[Related](relative-report.md)",
      "[File](file:///private/credentials.md)",
      "[Thread](grokoff://thread/another-thread)",
      "![Local image](/private/secret.png)",
      "![Tracking image](https://example.test/pixel.png)",
      "<https://example.test/source>",
    ].join("\n\n") }));
    expect(html).toContain("Secret");
    expect(html).toContain("Tracking image");
    expect(html).toContain('href="https://example.test/source"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain('href="/private');
    expect(html).not.toContain('href="relative');
    expect(html).not.toContain('href="file:');
    expect(html).not.toContain('href="grokoff:');
  });

  it.each([
    "javascript:alert(1)", "file:///tmp/source", "//example.test/a", "/tmp/a", "report.md",
    "https:\\example.test/a", "https://user:password@example.test/", "https://example.test/\nsource",
  ])("refuses non-citation URL %s", (url) => { expect(reportSourceUrl(url)).toBeUndefined(); });
});

describe("bounded report reads", () => {
  it("decodes UTF-8 characters split across chunks without damaging source URLs", async () => {
    const bytes = encode("# Résumé\n\n[Citation](https://example.test/source)");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const value of bytes) controller.enqueue(new Uint8Array([value]));
        controller.close();
      },
    });
    await expect(readReportResponse(new Response(stream, { headers: { "content-type": "text/markdown; charset=utf-8" } }), new AbortController().signal))
      .resolves.toBe("# Résumé\n\n[Citation](https://example.test/source)");
  });

  it("cancels an oversized declared response before reading it", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    await expect(readReportResponse(new Response(stream, { headers: {
      "content-type": "text/markdown", "content-length": String(REPORT_PREVIEW_MAX_BYTES + 1),
    } }), new AbortController().signal)).rejects.toThrow("size");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces its limit even when a response hides or understates its length", async () => {
    for (const declared of [undefined, "1"]) {
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(REPORT_PREVIEW_MAX_BYTES)); controller.enqueue(encode("x")); },
        cancel,
      });
      const headers: Record<string, string> = { "content-type": "text/markdown" };
      if (declared) headers["content-length"] = declared;
      await expect(readReportResponse(new Response(stream, { headers }), new AbortController().signal)).rejects.toThrow("size");
      expect(cancel).toHaveBeenCalledOnce();
    }
  });

  it.each([
    { bytes: encode("<h1>Not Markdown</h1>"), mime: "text/html" },
    { bytes: new Uint8Array([0xff, 0xfe]), mime: "text/markdown" },
    { bytes: encode("Binary\0payload"), mime: "text/plain" },
  ])("rejects binary, invalid UTF-8, or unexpected MIME ($mime)", async ({ bytes, mime }) => {
    await expect(readReportResponse(new Response(bytes, { headers: { "content-type": mime } }), new AbortController().signal)).rejects.toThrow("format");
  });

  it("cancels a stalled response when the dialog is dismissed", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const reading = readReportResponse(new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "text/markdown" },
    }), controller.signal);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
