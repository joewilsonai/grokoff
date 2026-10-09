// GrokOff: read a shared Markdown report without granting its contents access
// to other files. Only the original stored message authorizes the initial read.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Download, LoaderCircle, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { requestMessageFile, useLocalFileSave, type MessageAttachmentContext } from "./AttachmentPreview";

export const REPORT_PREVIEW_MAX_BYTES = 1024 * 1024;

/** Check the actual linked path, not a display label that can disguise it. */
export function isMarkdownReport(path: string): boolean {
  try {
    return /\.md$/i.test(decodeURIComponent(path.split(/[?#]/, 1)[0]!));
  } catch {
    return false;
  }
}

/** Reports can cite web pages, but cannot activate local paths or app schemes. */
export function reportSourceUrl(value: string): string | undefined {
  // oxlint-disable-next-line no-control-regex -- reject URL parser control-character normalization
  if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.username || url.password ? undefined : url.href;
  } catch {
    return undefined;
  }
}

/** Bound streamed responses as well as declared lengths and reject binary data. */
export async function readReportResponse(response: Response, signal: AbortSignal): Promise<string> {
  const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const reject = async (reason: string): Promise<never> => {
    await response.body?.cancel().catch(() => {});
    throw new Error(reason);
  };
  if (mime !== "text/markdown" && mime !== "text/plain") return reject("format");
  if (Number(response.headers.get("content-length")) > REPORT_PREVIEW_MAX_BYTES) return reject("size");
  if (signal.aborted) {
    await response.body?.cancel().catch(() => {});
    signal.throwIfAborted();
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > REPORT_PREVIEW_MAX_BYTES) throw new Error("size");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    if (text.includes("\0")) throw new Error("format");
    return text;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("format");
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const REPORT_COMPONENTS: Components = {
  a({ href, children }) {
    const source = href ? reportSourceUrl(href) : undefined;
    return source
      ? <a href={source} target="_blank" rel="noopener noreferrer" className="break-words text-accent underline decoration-accent/40 hover:decoration-accent">{children}</a>
      : <span>{children}</span>;
  },
  // No image is loaded while opening a report, even when its URL is remote.
  img({ alt }) { return <span className="text-ink-secondary">{alt || t("report.image")}</span>; },
  table({ children }) { return <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>; },
  th({ children }) { return <th className="border border-hairline/50 bg-inset px-3 py-2 text-start font-medium">{children}</th>; },
  td({ children }) { return <td className="border border-hairline/50 px-3 py-2 align-top">{children}</td>; },
  pre({ children }) { return <pre dir="ltr" className="max-w-full overflow-x-auto rounded-lg bg-inset p-3 text-sm">{children}</pre>; },
};

/** Separate from chat rendering: report text receives no message capability. */
export function ReportMarkdown({ text }: { text: string }) {
  return <article data-testid="report-content" dir="auto" className="mx-auto w-full max-w-3xl break-words text-sm leading-relaxed [overflow-wrap:anywhere] [&>*+*]:mt-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-medium [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_li+li]:mt-1 [&_blockquote]:border-s-2 [&_blockquote]:border-accent/40 [&_blockquote]:ps-4 [&_blockquote]:text-ink-secondary [&_hr]:border-hairline">
    <Markdown remarkPlugins={[remarkGfm]} components={REPORT_COMPONENTS}>{text}</Markdown>
  </article>;
}

export function ReportFileButton({ path, name, message }: { path: string; name: string; message: MessageAttachmentContext }) {
  const identity = JSON.stringify([message.threadId, message.messageId, path]);
  const [opened, setOpened] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpened(null); }, [identity]);
  if (!isMarkdownReport(path)) return null;
  return <>
    <button ref={trigger} type="button" className="table-action" title={t("report.open", { name })} aria-label={t("report.open", { name })} onClick={() => setOpened(identity)}><BookOpen size={14} /></button>
    {opened === identity && <ReportDialog key={identity} path={path} name={name} message={message} returnFocus={trigger.current} onClose={() => setOpened(null)} />}
  </>;
}

function ReportDialog({ path, name, message, returnFocus, onClose }: {
  path: string; name: string; message: MessageAttachmentContext; returnFocus: HTMLElement | null; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const save = useLocalFileSave(path, name, message);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [returnFocus]);
  return createPortal(<dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose} onClose={onClose}
    onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
    className="m-auto flex max-h-[92dvh] w-[min(96vw,960px)] max-w-none flex-col overflow-hidden rounded-2xl border border-hairline bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/55">
    <header className="flex shrink-0 items-center gap-2 border-b border-hairline/40 px-4 py-3">
      <BookOpen size={17} className="shrink-0 text-accent" aria-hidden="true" />
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">{name}</h2>
      <button type="button" className="table-action" disabled={save.state === "saving"} onClick={() => void save.save()} aria-label={t("report.download")} title={t("report.download")}><Download size={16} /></button>
      <button type="button" autoFocus className="table-action" onClick={onClose} aria-label={t("report.close")}><X size={16} /></button>
    </header>
    {save.state !== "idle" && <p role={save.state === "failed" ? "alert" : "status"} className="shrink-0 px-5 pt-3 text-xs text-ink-secondary">{save.state === "failed" ? save.reason : t(save.state === "saving" ? "attach.downloading" : "attach.downloaded")}</p>}
    <div className="min-h-0 overflow-auto p-5 sm:p-8"><ReportContent path={path} message={message} /></div>
  </dialog>, document.body);
}

function ReportContent({ path, message }: { path: string; message: MessageAttachmentContext }) {
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setText(null);
    setError(null);
    void (async () => {
      try {
        const response = await requestMessageFile(path, message, controller.signal);
        const content = await readReportResponse(response, controller.signal);
        if (!controller.signal.aborted) setText(content);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error && ["size", "format"].includes(reason.message) ? reason.message : "load");
      }
    })();
    return () => controller.abort();
  }, [path, message.threadId, message.messageId, attempt]);
  if (error) return <div className="py-8 text-center text-sm"><p role="alert" className="mb-3 text-ink-secondary">{t(error === "size" ? "report.tooLarge" : error === "format" ? "report.invalid" : "report.loadFailed")}</p><button type="button" className="rounded-lg border border-hairline px-3 py-2 hover:bg-raised" onClick={() => setAttempt(attempt + 1)}>{t("chat.retry")}</button></div>;
  if (text === null) return <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-ink-secondary"><LoaderCircle size={16} className="animate-spin" />{t("report.loading")}</div>;
  return text.trim() ? <ReportMarkdown text={text} /> : <p className="py-8 text-center text-sm text-ink-secondary">{t("report.empty")}</p>;
}
