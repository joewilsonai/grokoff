// GrokOff (2026-10-09): local report-only PDF export. No file-reading capability
// or privileged renderer is given to the temporary Chromium print surface.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultSaveName } from "./save-file.mjs";

export const REPORT_PDF_MAX_HTML_BYTES = 4 * 1024 * 1024;
export const REPORT_PDF_MAX_BYTES = 32 * 1024 * 1024;
export const REPORT_PDF_TIMEOUT_MS = 30_000;

const JOB_ID = /^[a-zA-Z0-9-]{1,64}$/;
const fail = (code) => new Error(code);
const TAGS = new Set(["article", "section", "sup", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "blockquote", "pre", "code", "em", "strong", "del", "a", "table", "thead", "tbody", "tr", "th", "td", "hr", "br", "input"]);
const NODE_KEYS = new Set(["tag", "children", "href", "dir", "start", "checked"]);
const PRINT_CSS = `
@page { size: Letter; margin: 18mm; }
html { color-scheme: light; }
body { margin: 0; color: #161616; background: white; font: 11pt/1.5 Arial, sans-serif; }
article { max-width: none; overflow-wrap: anywhere; }
article > * + * { margin-top: 1em; }
h1,h2,h3,h4,h5,h6 { break-after: avoid; line-height: 1.2; }
h1 { font-size: 24pt; } h2 { font-size: 18pt; } h3 { font-size: 14pt; }
p,li { orphans: 3; widows: 3; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 9pt; padding: 8pt; border: 1px solid #ddd; }
code { font-family: Menlo, Consolas, monospace; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; }
thead { display: table-header-group; } tr { break-inside: avoid; }
th,td { padding: 5pt; border: 1px solid #bbb; vertical-align: top; text-align: start; }
th { background: #f1f1f1; } blockquote { margin-inline: 0; padding-inline-start: 12pt; border-inline-start: 2pt solid #aaa; }
a { color: #174b82; text-decoration: underline; overflow-wrap: anywhere; }
a::after { content: " (" attr(href) ")"; font-size: 9pt; }
div { overflow: visible !important; } img,iframe,object,embed,video,audio { display: none !important; }
`;

export function reportPdfName(name) {
  const base = path.posix.basename(typeof name === "string" ? name.replaceAll("\\", "/") : "report");
  // oxlint-disable-next-line no-control-regex -- remove filename control characters
  const stem = base.replace(/\.(?:md|pdf)$/i, "").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120);
  return `${stem && !/^\.+$/.test(stem) ? stem : "report"}.pdf`;
}

export function reportPdfCitation(value) {
  // oxlint-disable-next-line no-control-regex -- reject URL parser control-character normalization
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return !url.username && !url.password && ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Serialize a bounded, inert node tree rather than accepting HTML. Main is
 * the sanitizer: no resource, style, event, file, app or script attributes. */
export function reportPdfArticle(root) {
  if (!root || root.tag !== "article") throw fail("pdf-invalid");
  const parts = [];
  let bytes = 0, nodes = 0;
  const append = (text) => {
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > REPORT_PDF_MAX_HTML_BYTES) throw fail("pdf-size");
    parts.push(text);
  };
  const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  function visit(node, depth) {
    if (++nodes > 50_000 || depth > 64) throw fail("pdf-size");
    if (typeof node === "string") {
      if (node.includes("\0") || Buffer.byteLength(node, "utf8") > REPORT_PDF_MAX_HTML_BYTES) throw fail("pdf-invalid");
      append(escape(node));
      return;
    }
    if (!node || typeof node !== "object" || Array.isArray(node) || !TAGS.has(node.tag) ||
      !Array.isArray(node.children) || Object.keys(node).some((key) => !NODE_KEYS.has(key))) throw fail("pdf-invalid");
    const href = node.tag === "a" ? reportPdfCitation(node.href) : null;
    const tag = node.tag === "a" && !href ? "span" : node.tag;
    if (tag === "input") { append(node.checked === true ? "<span>☑</span>" : "<span>☐</span>"); return; }
    let attributes = href ? ` href="${escape(href)}"` : "";
    if (["auto", "ltr", "rtl"].includes(node.dir)) attributes += ` dir="${node.dir}"`;
    if (tag === "ol" && Number.isSafeInteger(node.start) && Math.abs(node.start) <= 1_000_000) attributes += ` start="${node.start}"`;
    append(`<${tag}${attributes}>`);
    for (const child of node.children) visit(child, depth + 1);
    if (!["hr", "br"].includes(tag)) append(`</${tag}>`);
  }
  visit(root, 0);
  return parts.join("");
}

export function reportPdfDocument(content) {
  const html = reportPdfArticle(content);
  // The first policy cannot be relaxed by content supplied later in the page.
  // Styles are our fixed print rules; the isolated session also denies requests.
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none';"><title>Report</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`;
}

function fileIdentity(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw fail("pdf-destination");
    return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** Capture the exact user-selected regular destination before generating. */
export function reportPdfDestination(selected) {
  if (typeof selected !== "string" || !path.isAbsolute(selected)) throw fail("pdf-destination");
  const parent = fs.realpathSync(path.dirname(selected));
  const destination = path.join(parent, path.basename(selected));
  const stat = fs.lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail("pdf-destination");
  return { destination, parent, parentIdentity: `${stat.dev}:${stat.ino}`, identity: fileIdentity(destination) };
}

function checkReportPdfParent(target) {
  const stat = fs.lstatSync(target.parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(target.parent) !== target.parent ||
    `${stat.dev}:${stat.ino}` !== target.parentIdentity) throw fail("pdf-destination");
}

/** Atomic, private replacement. Never follow a final destination symlink;
 * a new destination uses exclusive link creation rather than overwriting a race. */
export async function writeReportPdf(target, pdf, { signal, beforeCommit = () => {} } = {}) {
  if (!Buffer.isBuffer(pdf) || !pdf.length || pdf.length > REPORT_PDF_MAX_BYTES) throw fail("pdf-size");
  const temporary = path.join(path.dirname(target.destination), `.grokoff-report-${randomUUID()}.tmp`);
  let handle, temporaryIdentity;
  const check = () => {
    if (signal?.aborted) throw fail(signal.reason === "pdf-timeout" ? "pdf-timeout" : "pdf-cancelled");
    beforeCommit(); checkReportPdfParent(target);
  };
  const cleanTemporary = () => {
    try {
      const stat = fs.lstatSync(temporary);
      // A changed/unproved entry is retained rather than deleting another file.
      if (stat.isFile() && !stat.isSymbolicLink() && `${stat.dev}:${stat.ino}` === temporaryIdentity) fs.unlinkSync(temporary);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  };
  try {
    check();
    handle = await fs.promises.open(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    const created = await handle.stat(); temporaryIdentity = `${created.dev}:${created.ino}`;
    check();
    await handle.chmod(0o600);
    if (((await handle.stat()).mode & 0o777) !== 0o600) throw fail("pdf-filesystem");
    await handle.writeFile(pdf, { signal });
    await handle.sync();
    await handle.close();
    handle = undefined;
    check();
    const commitEntry = fs.lstatSync(temporary);
    if (!commitEntry.isFile() || commitEntry.isSymbolicLink() || `${commitEntry.dev}:${commitEntry.ino}` !== temporaryIdentity) throw fail("pdf-destination");
    if ((commitEntry.mode & 0o777) !== 0o600) throw fail("pdf-filesystem");
    if (fileIdentity(target.destination) !== target.identity) throw fail("pdf-destination");
    if (target.identity === null) fs.linkSync(temporary, target.destination);
    else fs.renameSync(temporary, target.destination); // replaces the entry, never follows a symlink
  } catch (error) {
    if (error.code === "EEXIST") throw fail("pdf-destination");
    if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV", "EINVAL"].includes(error.code)) throw fail("pdf-filesystem");
    throw error;
  } finally {
    try { if (handle !== undefined) await handle.close(); }
    finally { cleanTemporary(); }
  }
}

/** Dependencies are injected so authority/lifecycle failures are portable tests.
 * Production supplies only its primary window and the known local origin. */
export function createReportPdfService({ BrowserWindow, dialog, getOwner, getLocalOrigin, getDownloads,
  isRemoteClient = () => false, platform = process.platform, timeoutMs = REPORT_PDF_TIMEOUT_MS, writePdf = writeReportPdf }) {
  let current = null;
  // Electron has no programmatic Save-dialog cancellation. An aborted reader
  // relinquishes its job, but a still-open chooser must prevent another chooser.
  let chooserPending = false;
  let writePending = false;
  function ownerFor(event) {
    const owner = getOwner();
    const sender = event?.sender;
    const frame = event?.senderFrame;
    let origin, pageOrigin;
    try { origin = new URL(frame?.url).origin; pageOrigin = new URL(sender?.getURL()).origin; } catch { /* deny */ }
    if (platform !== "darwin" || isRemoteClient() || !owner || owner.isDestroyed() || sender?.isDestroyed() ||
      sender !== owner.webContents || frame !== sender.mainFrame || !getLocalOrigin() ||
      origin !== getLocalOrigin() || pageOrigin !== getLocalOrigin()) throw fail("pdf-denied");
    return owner;
  }
  function cancelReportPdf(event, id) {
    ownerFor(event);
    if (!current || current.sender !== event.sender || current.id !== id) return false;
    current.controller.abort();
    return true;
  }
  async function exportReportPdf(event, request) {
    const owner = ownerFor(event);
    if (!request || typeof request.id !== "string" || !JOB_ID.test(request.id) || typeof request.name !== "string" ||
      request.name.length > 2048 || Object.keys(request).some((key) => !["id", "name", "content"].includes(key))) throw fail("pdf-invalid");
    const document = reportPdfDocument(request.content);
    if (current || chooserPending || writePending) throw fail("pdf-busy");
    const job = { id: request.id, sender: event.sender, controller: new AbortController() };
    current = job;
    const signal = job.controller.signal;
    const cancel = () => job.controller.abort();
    const navigate = (_event, _url, _inPlace, mainFrame) => { if (mainFrame) cancel(); };
    owner.once("closed", cancel);
    event.sender.once("destroyed", cancel);
    event.sender.on("did-start-navigation", navigate);
    event.sender.once("render-process-gone", cancel);
    let printWindow = null;
    let deadline;
    let rejectAbort;
    const abortCode = () => signal.reason === "pdf-timeout" ? "pdf-timeout" : "pdf-cancelled";
    const aborted = new Promise((_resolve, reject) => { rejectAbort = () => reject(fail(abortCode())); });
    // Cancellation may arrive during the asynchronous filename suggestion,
    // before the first race is installed. Keep that rejection observed.
    void aborted.catch(() => {});
    signal.addEventListener("abort", rejectAbort, { once: true });
    const check = () => { if (signal.aborted) throw fail(abortCode()); ownerFor(event); };
    try {
      const defaultPath = await defaultSaveName(getDownloads(), reportPdfName(request.name));
      check();
      chooserPending = true;
      const choosing = Promise.resolve().then(() => dialog.showSaveDialog(owner, {
        title: "Save report as PDF", defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      })).finally(() => { chooserPending = false; });
      const choice = await Promise.race([choosing, aborted]);
      check();
      if (choice.canceled || !choice.filePath) return "cancelled";
      const target = reportPdfDestination(choice.filePath);
      printWindow = new BrowserWindow({ show: false, webPreferences: {
        partition: `grokoff-report-pdf-${randomUUID()}`, sandbox: true, contextIsolation: true,
        nodeIntegration: false, javascript: false, webSecurity: true, images: false, spellcheck: false,
      } });
      const contents = printWindow.webContents;
      const documentUrl = `data:text/html;charset=utf-8,${encodeURIComponent(document)}`;
      let documentRequested = false;
      contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      contents.session.setPermissionCheckHandler(() => false);
      contents.session.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
        // The first owned main-frame document is our sanitized in-memory HTML.
        // No other data URL, replay, frame or external/resource request is allowed.
        const initialDocument = !documentRequested && details.webContentsId === contents.id &&
          details.resourceType === "mainFrame" && details.url === documentUrl;
        if (initialDocument) documentRequested = true;
        callback({ cancel: !initialDocument });
      });
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      contents.on("will-navigate", (navigation) => navigation.preventDefault());
      contents.on("will-frame-navigate", (navigation) => navigation.preventDefault());
      const timedOut = new Promise((_resolve, reject) => {
        deadline = setTimeout(() => { job.controller.abort("pdf-timeout"); reject(fail("pdf-timeout")); }, timeoutMs);
      });
      const generate = async () => {
        await contents.loadURL(documentUrl);
        check();
        return contents.printToPDF({ printBackground: true, pageSize: "Letter", preferCSSPageSize: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      };
      const pdf = await Promise.race([generate(), aborted, timedOut]);
      check();
      writePending = true;
      const writing = Promise.resolve().then(() => writePdf(target, pdf, { signal, beforeCommit: check }))
        .finally(() => { writePending = false; });
      await Promise.race([writing, aborted, timedOut]);
      return "saved";
    } catch (error) {
      if (error.message === "pdf-cancelled") return "cancelled";
      if (["pdf-size", "pdf-timeout", "pdf-destination", "pdf-filesystem", "pdf-denied"].includes(error.message)) throw error;
      throw fail("pdf-failed");
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener("abort", rejectAbort);
      owner.removeListener("closed", cancel);
      event.sender.removeListener("destroyed", cancel);
      event.sender.removeListener("did-start-navigation", navigate);
      event.sender.removeListener("render-process-gone", cancel);
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
      if (current === job) current = null;
    }
  }
  return { exportReportPdf, cancelReportPdf, dispose() { current?.controller.abort(); } };
}
