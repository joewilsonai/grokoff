// GrokOff: read a shared Markdown report without granting its contents access
// to other files. Only the original stored message authorizes the initial read.
// GrokOff modification (2026-10-09): bound preview attempts with manual recovery.
// GrokOff modification (2026-10-09): export only the loaded report to an inert Mac PDF surface.
// GrokOff modification (2026-10-09): effect cleanup must not dismiss a replayed reader.
// GrokOff modification (2026-10-10): a chat reader outlives its virtualized row.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Download, LoaderCircle, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useReportPdf } from "@/lib/report-pdf";
import type { Message } from "@/state/store";
import { requestMessageFile, useLocalFileSave, type MessageAttachmentContext } from "./AttachmentPreview";

export const REPORT_PREVIEW_MAX_BYTES = 1024 * 1024;
// A preview is at most 1 MiB. Allow remote connections time to respond, while
// ending a stalled attempt without making the person close the report.
export const REPORT_PREVIEW_TIMEOUT_MS = 30_000;

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

type ReportRequest = { path: string; name: string; message: MessageAttachmentContext; returnFocus: HTMLElement | null };
const ReportReaderContext = createContext<((request: ReportRequest) => void) | null>(null);

/** Retain only the selected stored source's authority, not transient row
 * fields or its object identity. The server still authorizes every read. */
function reportSourceKey(message: Message): string {
  return JSON.stringify([message.role, message.kind, message.text ?? "", message.from?.botId ?? null,
    message.attachments?.map((attachment) => [attachment.kind, attachment.path, attachment.kind === "file" ? attachment.name : null]) ?? []]);
}

/** A chat's full current branch owns the modal; its bounded row window does
 * not. Keep the context callback stable so appends do not redraw every link. */
export function ReportReaderHost({ ownerId, threadId, messages, children }: {
  ownerId: string; threadId: string; messages: readonly Message[]; children: ReactNode;
}) {
  const authority = useRef({ ownerId, threadId, messages });
  authority.current = { ownerId, threadId, messages };
  const [opened, setOpened] = useState<(ReportRequest & { owner: string; sourceKey: string }) | null>(null);
  const open = useCallback((request: ReportRequest) => {
    const current = authority.current;
    const source = current.messages.find((message) => message.id === request.message.messageId);
    if (request.message.threadId !== current.threadId || !source) return;
    setOpened({ ...request, message: { ...request.message }, owner: JSON.stringify([current.ownerId, current.threadId]), sourceKey: reportSourceKey(source) });
  }, []);
  const source = opened ? messages.find((message) => message.id === opened.message.messageId) : undefined;
  const shown = opened?.owner === JSON.stringify([ownerId, threadId]) && source && reportSourceKey(source) === opened.sourceKey ? opened : null;
  // Omit invalid authority on this render; clearing its state also prevents
  // returning to a previously selected branch from reopening an old reader.
  useEffect(() => { if (opened && !shown) setOpened(null); }, [opened, shown]);
  return <ReportReaderContext.Provider value={open}>
    {children}
    {shown && <ReportDialog key={JSON.stringify([shown.owner, shown.message.messageId, shown.path, shown.name])}
      path={shown.path} name={shown.name} message={shown.message} returnFocus={shown.returnFocus} onClose={() => setOpened(null)} />}
  </ReportReaderContext.Provider>;
}

export function ReportFileButton({ path, name, message }: { path: string; name: string; message: MessageAttachmentContext }) {
  const openReport = useContext(ReportReaderContext);
  const identity = JSON.stringify([message.threadId, message.messageId, path]);
  const [opened, setOpened] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpened(null); }, [identity]);
  if (!isMarkdownReport(path)) return null;
  return <>
    <button ref={trigger} type="button" className="table-action" title={t("report.open", { name })} aria-label={t("report.open", { name })}
      onClick={() => openReport ? openReport({ path, name, message, returnFocus: trigger.current }) : setOpened(identity)}><BookOpen size={14} /></button>
    {!openReport && opened === identity && <ReportDialog key={identity} path={path} name={name} message={message} returnFocus={trigger.current} onClose={() => setOpened(null)} />}
  </>;
}

function ReportDialog({ path, name, message, returnFocus, onClose }: {
  path: string; name: string; message: MessageAttachmentContext; returnFocus: HTMLElement | null; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const save = useLocalFileSave(path, name, message);
  const content = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const pdf = useReportPdf(JSON.stringify([message.threadId, message.messageId, path, name]));
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [returnFocus]);
  // Explicit Close and the native cancel event own dismissal. Cleanup closes
  // the modal too; its close event must not dismiss StrictMode's replayed reader.
  return createPortal(<dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose}
    onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
    className="m-auto flex max-h-[92dvh] w-[min(96vw,960px)] max-w-none flex-col overflow-hidden rounded-2xl border border-hairline bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/55">
    <header className="flex shrink-0 items-center gap-2 border-b border-hairline/40 px-4 py-3">
      <BookOpen size={17} className="shrink-0 text-accent" aria-hidden="true" />
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">{name}</h2>
      {pdf.available && <button type="button" className="shrink-0 rounded-lg border border-hairline px-2 py-1 text-xs hover:bg-raised disabled:opacity-50"
        disabled={!ready || pdf.state === "saving"} onClick={() => void pdf.save(content.current?.querySelector<HTMLElement>('article[data-testid="report-content"]') ?? null, name)}>{t("report.savePdf")}</button>}
      <button type="button" className="table-action" disabled={save.state === "saving"} onClick={() => void save.save()} aria-label={t("report.download")} title={t("report.download")}><Download size={16} /></button>
      <button type="button" autoFocus className="table-action" onClick={onClose} aria-label={t("report.close")}><X size={16} /></button>
    </header>
    {save.state !== "idle" && <p role={save.state === "failed" ? "alert" : "status"} className="shrink-0 px-5 pt-3 text-xs text-ink-secondary">{save.state === "failed" ? save.reason : t(save.state === "saving" ? "attach.downloading" : "attach.downloaded")}</p>}
    {pdf.state !== "idle" && <p role={pdf.state === "failed" ? "alert" : "status"} className="shrink-0 px-5 pt-3 text-xs text-ink-secondary">{t(pdf.state === "saving" ? "report.pdfSaving" : pdf.state === "saved" ? "report.pdfSaved" : pdf.reason === "pdf-size" ? "report.pdfTooLarge" : pdf.reason === "pdf-timeout" ? "report.pdfTimedOut" : pdf.reason === "pdf-destination" ? "report.pdfDestination" : pdf.reason === "pdf-filesystem" ? "report.pdfFilesystem" : pdf.reason === "pdf-busy" ? "report.pdfBusy" : "report.pdfFailed")}</p>}
    <div ref={content} className="min-h-0 overflow-auto p-5 sm:p-8"><ReportContent path={path} message={message} onReady={setReady} /></div>
  </dialog>, document.body);
}

function ReportContent({ path, message, onReady }: { path: string; message: MessageAttachmentContext; onReady: (ready: boolean) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setText(null);
    setError(null);
    onReady(false);
    // One deadline covers both response headers and the complete UTF-8 body.
    // Report the timeout here: the catch deliberately keeps aborted reads
    // quiet, including dialog close and replacement by a newer attempt.
    const deadline = setTimeout(() => {
      controller.abort();
      setError("timeout");
    }, REPORT_PREVIEW_TIMEOUT_MS);
    void (async () => {
      try {
        const response = await requestMessageFile(path, message, controller.signal);
        const content = await readReportResponse(response, controller.signal);
        if (!controller.signal.aborted) { setText(content); onReady(Boolean(content.trim())); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error && ["size", "format"].includes(reason.message) ? reason.message : "load");
      } finally {
        clearTimeout(deadline);
      }
    })();
    return () => { clearTimeout(deadline); controller.abort(); };
  }, [path, message.threadId, message.messageId, attempt, onReady]);
  if (error) return <div className="py-8 text-center text-sm"><p role="alert" className="mb-3 text-ink-secondary">{t(error === "timeout" ? "report.timedOut" : error === "size" ? "report.tooLarge" : error === "format" ? "report.invalid" : "report.loadFailed")}</p><button type="button" className="rounded-lg border border-hairline px-3 py-2 hover:bg-raised" onClick={() => setAttempt(attempt + 1)}>{t("chat.retry")}</button></div>;
  if (text === null) return <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-ink-secondary"><LoaderCircle size={16} className="animate-spin" />{t("report.loading")}</div>;
  return text.trim() ? <ReportMarkdown text={text} /> : <p className="py-8 text-center text-sm text-ink-secondary">{t("report.empty")}</p>;
}
