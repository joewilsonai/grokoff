// GrokOff (2026-10-09): disposable authority, inert-content and lifecycle controls.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { createReportPdfService, reportPdfArticle, reportPdfCitation, reportPdfDestination, reportPdfDocument,
  reportPdfName, writeReportPdf, REPORT_PDF_MAX_HTML_BYTES, REPORT_PDF_MAX_BYTES } from "./report-pdf.mjs";

const article = (...children) => ({ tag: "article", children });
const request = (content = article({ tag: "h1", children: ["Synthetic report"] })) => ({ id: "owned-job-1", name: "research.md", content });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "grokoff-report-pdf-"));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, "report.pdf");
  let origin = "http://127.0.0.1:32123";
  const sender = new EventEmitter();
  sender.mainFrame = { url: `${origin}/` };
  sender.getURL = () => `${origin}/`;
  sender.isDestroyed = () => false;
  const owner = new EventEmitter();
  owner.webContents = sender;
  owner.isDestroyed = () => false;
  const windows = [], dialogs = [];
  class PrintWindow extends EventEmitter {
    constructor(settings) {
      super();
      this.settings = settings;
      this.destroyed = false;
      this.webContents = new EventEmitter();
      const contents = this.webContents;
      contents.id = windows.length + 20;
      contents.session = {
        setPermissionRequestHandler(handler) { contents.permission = handler; },
        setPermissionCheckHandler(handler) { contents.permissionCheck = handler; },
        webRequest: { onBeforeRequest(_filter, handler) { contents.request = handler; } },
      };
      contents.setWindowOpenHandler = (handler) => { contents.popup = handler; };
      contents.loadURL = async (url) => {
        contents.url = url;
        options.beforeLoad?.(this);
        contents.request({ url, webContentsId: contents.id, resourceType: "mainFrame" }, (decision) => { contents.initialDecision = decision; });
        if (contents.initialDecision.cancel) throw new Error("Fixture initial document blocked");
        await options.load?.(this);
      };
      contents.printToPDF = async (settings) => { contents.printSettings = settings; return options.print ? options.print(this) : Buffer.from("synthetic PDF bytes"); };
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit("closed"); }
  }
  const service = createReportPdfService({ BrowserWindow: PrintWindow,
    dialog: { async showSaveDialog(parent, settings) { dialogs.push({ parent, settings }); return options.dialog ? options.dialog() : { filePath: destination }; } },
    getOwner: () => owner, getLocalOrigin: () => origin, getDownloads: () => directory, isRemoteClient: options.isRemoteClient,
    platform: options.platform ?? "darwin", timeoutMs: options.timeoutMs ?? 1000, writePdf: options.write });
  const event = { sender, senderFrame: sender.mainFrame };
  return { directory, destination, windows, dialogs, owner, sender, event, service, changeOrigin(value) { origin = value; } };
}

test("serializes report formatting while escaping text and allowing only citation URLs", () => {
  const html = reportPdfArticle(article({ tag: "h1", children: ['<script>alert("x")</script>'] },
    { tag: "a", href: "https://example.test/source?q=one&two=2", children: ["Citation"] },
    { tag: "pre", dir: "ltr", children: [{ tag: "code", children: ["<tag> & data"] }] },
    { tag: "input", children: [], checked: true }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /href="https:\/\/example.test\/source\?q=one&amp;two=2"/);
  assert.match(html, /<pre dir="ltr"><code>&lt;tag&gt; &amp; data<\/code>/);
  assert.match(html, /☑/);
});

for (const href of ["javascript:alert(1)", "file:///private/secret", "data:text/html,secret", "grokoff://thread/other", "/api/config", "relative.md", "//example.test/a", "https://user:secret@example.test/", "https:\\example.test/", "https://example.test/\nsecret"]) {
  test(`removes privileged or malformed PDF hyperlink ${href}`, () => {
    assert.equal(reportPdfCitation(href), null);
    const html = reportPdfArticle(article({ tag: "a", href, children: ["Source label"] }));
    assert.equal(html, "<article><span>Source label</span></article>");
  });
}

test("rejects resource/active tags and attributes rather than relying on renderer HTML", () => {
  for (const node of [
    { tag: "img", children: [], href: "https://example.test/pixel" },
    { tag: "iframe", children: [] }, { tag: "script", children: ["secret"] },
    { tag: "p", children: ["text"], style: "background:url(file:///private/secret)" },
    { tag: "a", href: "https://example.test/", children: ["text"], onclick: "alert(1)" },
  ]) assert.throws(() => reportPdfDocument(article(node)), /pdf-invalid/);
  assert.throws(() => reportPdfDocument("<article>HTML is not accepted</article>"), /pdf-invalid/);
});

test("bounds serialization bytes, nesting and node count including cyclic snapshots", () => {
  assert.throws(() => reportPdfArticle(article("&".repeat(REPORT_PDF_MAX_HTML_BYTES / 4))), /pdf-size/);
  let deep = article("leaf");
  for (let i = 0; i < 65; i++) deep = article(deep);
  assert.throws(() => reportPdfArticle(deep), /pdf-size/);
  assert.throws(() => reportPdfArticle(article(...Array(50_001).fill("x"))), /pdf-size/);
  const cycle = article(); cycle.children.push(cycle);
  assert.throws(() => reportPdfArticle(cycle), /pdf-size/);
});

test("uses a safe PDF basename and a fixed network-denying print document", () => {
  assert.equal(reportPdfName("../../report final.MD"), "report final.pdf");
  assert.equal(reportPdfName("C:\\private\\report.pdf"), "report.pdf");
  assert.equal(reportPdfName("\0<>:.."), "report.pdf");
  const html = reportPdfDocument(article("Report only"));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /@page \{ size: Letter/);
  assert.match(html, /white-space: pre-wrap/);
});

test("only the exact local primary main frame can open a save dialog or print", async (t) => {
  const f = fixture(t);
  const outsider = new EventEmitter(); outsider.mainFrame = { url: f.event.senderFrame.url };
  outsider.getURL = f.sender.getURL; outsider.isDestroyed = () => false;
  for (const event of [
    { ...f.event, senderFrame: { url: f.event.senderFrame.url } },
    { sender: outsider, senderFrame: outsider.mainFrame },
    { ...f.event, senderFrame: { url: "https://remote.test/" } },
    { ...f.event, senderFrame: undefined },
  ]) await assert.rejects(f.service.exportReportPdf(event, request()), /pdf-denied/);
  assert.equal(f.dialogs.length, 0); assert.equal(f.windows.length, 0);
  const otherPlatform = fixture(t, { platform: "win32" });
  await assert.rejects(otherPlatform.service.exportReportPdf(otherPlatform.event, request()), /pdf-denied/);
});

test("native dialog cancellation is quiet and creates no print surface/output", async (t) => {
  const f = fixture(t, { dialog: () => ({ canceled: true }) });
  assert.equal(await f.service.exportReportPdf(f.event, request()), "cancelled");
  assert.equal(f.windows.length, 0); assert.equal(fs.existsSync(f.destination), false);
  assert.equal(f.dialogs[0].parent, f.owner);
  assert.ok(f.dialogs[0].settings.properties.includes("showOverwriteConfirmation"));
});

test("paired remote loopback pages receive no PDF preload capability and cannot open a chooser", async (t) => {
  const origin = "http://127.0.0.1:32123";
  function preload(remote) {
    let bridge;
    vm.runInNewContext(fs.readFileSync(new URL("./preload.cjs", import.meta.url), "utf8"), {
      process: { platform: "darwin", argv: [`--omb-local-origin=${origin}`, ...(remote ? ["--openmausbot-remote-client"] : [])] },
      location: { origin }, TextEncoder, localStorage: { getItem: () => null },
      require: () => ({ webUtils: {}, contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
        ipcRenderer: { on() {}, removeListener() {}, send() {}, invoke: async () => "saved" } }),
    });
    return bridge;
  }
  assert.equal(typeof preload(false).exportReportPdf, "function");
  assert.equal(preload(true).exportReportPdf, undefined);
  assert.equal(preload(true).cancelReportPdf, undefined);
  const f = fixture(t, { isRemoteClient: () => true });
  await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-denied/);
  assert.equal(f.dialogs.length, 0); assert.equal(f.windows.length, 0);
});

test("changing to a paired relay while choosing a destination refuses printing", async (t) => {
  let remote = false;
  const f = fixture(t, { isRemoteClient: () => remote, dialog: () => { remote = true; return { filePath: f.destination }; } });
  await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-denied/);
  assert.equal(f.windows.length, 0); assert.equal(fs.existsSync(f.destination), false);
});

test("prints only its isolated report document and denies resources, popups and permissions", async (t) => {
  const f = fixture(t);
  assert.equal(await f.service.exportReportPdf(f.event, request()), "saved");
  const w = f.windows[0], c = w.webContents;
  assert.equal(w.settings.show, false);
  assert.equal(w.settings.webPreferences.javascript, false);
  assert.equal(w.settings.webPreferences.nodeIntegration, false);
  assert.equal(w.settings.webPreferences.sandbox, true);
  assert.equal(w.settings.webPreferences.preload, undefined);
  assert.ok(!w.settings.webPreferences.partition.startsWith("persist:"));
  for (const url of ["https://example.test/pixel", "file:///private/secret", "http://127.0.0.1:8799/api/config"]) {
    let decision; c.request({ url }, (value) => { decision = value; });
    assert.deepEqual(decision, { cancel: true });
  }
  let permission; c.permission(c, "media", (value) => { permission = value; });
  assert.equal(permission, false); assert.equal(c.permissionCheck(), false);
  assert.deepEqual(c.popup(), { action: "deny" });
  let prevented = false; c.emit("will-frame-navigate", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  const document = decodeURIComponent(c.url.split(",").slice(1).join(","));
  assert.match(document, /Synthetic report/);
  assert.equal(w.destroyed, true);
  assert.equal(fs.readFileSync(f.destination, "utf8"), "synthetic PDF bytes");
  if (process.platform !== "win32") assert.equal(fs.statSync(f.destination).mode & 0o777, 0o600);
  assert.equal(f.sender.listenerCount("did-start-navigation"), 0);
});

test("permits only its first exact owned main document and denies altered, unowned or repeated requests", async (t) => {
  const f = fixture(t, { beforeLoad(w) {
    const c = w.webContents;
    for (const details of [
      { url: c.url + "changed", webContentsId: c.id, resourceType: "mainFrame" },
      { url: c.url, webContentsId: c.id + 1, resourceType: "mainFrame" },
      { url: c.url, resourceType: "mainFrame" },
      { url: c.url, webContentsId: c.id, resourceType: "subFrame" },
      { url: c.url, webContentsId: c.id, resourceType: "image" },
      { url: "data:text/html,other", webContentsId: c.id, resourceType: "mainFrame" },
      { url: "file:///private/secret", webContentsId: c.id, resourceType: "mainFrame" },
      { url: "https://example.test/", webContentsId: c.id, resourceType: "mainFrame" },
    ]) {
      let result; c.request(details, (decision) => { result = decision; }); assert.deepEqual(result, { cancel: true });
    }
  }, load(w) {
    const c = w.webContents;
    assert.deepEqual(c.initialDecision, { cancel: false });
    let replay; c.request({ url: c.url, webContentsId: c.id, resourceType: "mainFrame" }, (decision) => { replay = decision; });
    assert.deepEqual(replay, { cancel: true });
  } });
  assert.equal(await f.service.exportReportPdf(f.event, request()), "saved");
  assert.equal(f.windows[0].destroyed, true);
});

for (const stage of ["load", "print"]) {
  test(`bounds a stalled ${stage} and destroys the exact print surface`, async (t) => {
    const options = { timeoutMs: 20, [stage]: () => new Promise(() => {}) };
    const f = fixture(t, options);
    await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-timeout/);
    assert.equal(f.windows[0].destroyed, true); assert.equal(fs.existsSync(f.destination), false);
    assert.equal(f.sender.listenerCount("did-start-navigation"), 0);
  });
}

test("singleflight job cancellation is owner-scoped and releases the slot", async (t) => {
  const started = deferred();
  const f = fixture(t, { load: () => { started.resolve(); return new Promise(() => {}); } });
  const first = f.service.exportReportPdf(f.event, request());
  await started.promise;
  await assert.rejects(f.service.exportReportPdf(f.event, { ...request(), id: "second" }), /pdf-busy/);
  assert.equal(f.service.cancelReportPdf(f.event, "other"), false);
  assert.equal(f.service.cancelReportPdf(f.event, "owned-job-1"), true);
  assert.equal(await first, "cancelled");
  assert.equal(f.windows[0].destroyed, true); assert.equal(fs.existsSync(f.destination), false);
  f.service.dispose();
});

test("failed Chromium printing releases its surface and allows a later export", async (t) => {
  let calls = 0;
  const f = fixture(t, { print: () => { if (++calls === 1) throw new Error("private fixture failure"); return Buffer.from("recovered PDF"); } });
  await assert.rejects(f.service.exportReportPdf(f.event, request()), { message: "pdf-failed" });
  assert.equal(f.windows[0].destroyed, true); assert.equal(fs.existsSync(f.destination), false);
  assert.equal(await f.service.exportReportPdf(f.event, { ...request(), id: "fresh-job" }), "saved");
  assert.equal(f.windows[1].destroyed, true);
});

test("service shutdown cancels an outstanding native chooser without creating a print surface", async (t) => {
  const started = deferred(), choice = deferred();
  const f = fixture(t, { dialog: () => { started.resolve(); return choice.promise; } });
  const pending = f.service.exportReportPdf(f.event, request());
  await started.promise; f.service.dispose();
  assert.equal(await pending, "cancelled");
  await assert.rejects(f.service.exportReportPdf(f.event, { ...request(), id: "replacement" }), /pdf-busy/);
  choice.resolve({ filePath: f.destination });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.windows.length, 0); assert.equal(fs.existsSync(f.destination), false);
});

test("oversized native output fails before writing and destroys its exact surface", async (t) => {
  const f = fixture(t, { print: () => Buffer.alloc(REPORT_PDF_MAX_BYTES + 1) });
  await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-size/);
  assert.equal(f.windows[0].destroyed, true); assert.equal(fs.existsSync(f.destination), false);
  assert.deepEqual(fs.readdirSync(f.directory), []);
});

for (const eventName of ["destroyed", "render-process-gone", "did-start-navigation"]) {
  test(`owner ${eventName} cancels output rather than exporting after replacement`, async (t) => {
    const started = deferred();
    const f = fixture(t, { print: () => { started.resolve(); return new Promise(() => {}); } });
    const pending = f.service.exportReportPdf(f.event, request());
    await started.promise;
    f.sender.emit(eventName, {}, "https://remote.test", false, true);
    assert.equal(await pending, "cancelled");
    assert.equal(f.windows[0].destroyed, true); assert.equal(fs.existsSync(f.destination), false);
  });
}

test("revalidates the local owner after save-dialog await before creating a print window", async (t) => {
  const wait = deferred();
  const f = fixture(t, { dialog: () => wait.promise });
  const pending = f.service.exportReportPdf(f.event, request());
  await new Promise((resolve) => setImmediate(resolve));
  f.changeOrigin("https://remote.test");
  wait.resolve({ filePath: f.destination });
  await assert.rejects(pending, /pdf-denied/);
  assert.equal(f.windows.length, 0); assert.equal(fs.existsSync(f.destination), false);
});

test("refuses malformed/oversized requests before native dialogs", async (t) => {
  const f = fixture(t);
  for (const input of [{ ...request(), id: [] }, { ...request(), path: "/private/secret" }, { ...request(), content: article("&".repeat(REPORT_PDF_MAX_HTML_BYTES)) }]) {
    await assert.rejects(f.service.exportReportPdf(f.event, input), /pdf-invalid|pdf-size/);
  }
  assert.equal(f.dialogs.length, 0);
});

test("private atomic replacement preserves existing bytes on precommit failures", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.destination, "original", { mode: 0o644 });
  const target = reportPdfDestination(f.destination);
  await assert.rejects(writeReportPdf(target, Buffer.alloc(REPORT_PDF_MAX_BYTES + 1)), /pdf-size/);
  assert.equal(fs.readFileSync(f.destination, "utf8"), "original");
  await writeReportPdf(target, Buffer.from("replacement"));
  assert.equal(fs.readFileSync(f.destination, "utf8"), "replacement");
  if (process.platform !== "win32") assert.equal(fs.statSync(f.destination).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(f.directory), ["report.pdf"]);
});

test("refuses a destination created or changed while printing without overwriting it", async (t) => {
  const f = fixture(t);
  const absent = reportPdfDestination(f.destination);
  fs.writeFileSync(f.destination, "racing new file");
  await assert.rejects(writeReportPdf(absent, Buffer.from("new PDF")), /pdf-destination/);
  const previous = reportPdfDestination(f.destination);
  fs.writeFileSync(f.destination, "changed selected file");
  await assert.rejects(writeReportPdf(previous, Buffer.from("new PDF")), /pdf-destination/);
  assert.equal(fs.readFileSync(f.destination, "utf8"), "changed selected file");
  assert.deepEqual(fs.readdirSync(f.directory), ["report.pdf"]);
});

test("never follows a selected symlink or a symlink swapped in while printing", { skip: process.platform === "win32" }, async (t) => {
  const f = fixture(t), outside = path.join(f.directory, "outside.txt");
  fs.writeFileSync(outside, "outside sentinel");
  fs.symlinkSync(outside, f.destination);
  assert.throws(() => reportPdfDestination(f.destination), /pdf-destination/);
  fs.unlinkSync(f.destination);
  const target = reportPdfDestination(f.destination);
  fs.symlinkSync(outside, f.destination);
  await assert.rejects(writeReportPdf(target, Buffer.from("new PDF")), /pdf-destination/);
  assert.equal(fs.readFileSync(outside, "utf8"), "outside sentinel");
  assert.deepEqual(fs.readdirSync(f.directory).sort(), ["outside.txt", "report.pdf"]);
});

test("replacing a selected hardlink does not mutate the other linked file", async (t) => {
  const f = fixture(t), other = path.join(f.directory, "other.txt");
  fs.writeFileSync(other, "other file sentinel"); fs.linkSync(other, f.destination);
  await writeReportPdf(reportPdfDestination(f.destination), Buffer.from("new PDF"));
  assert.equal(fs.readFileSync(other, "utf8"), "other file sentinel");
  assert.equal(fs.readFileSync(f.destination, "utf8"), "new PDF");
});

for (const replacement of ["directory", "symlink"]) {
  test(`refuses a selected parent replaced by ${replacement} during async printing`, { skip: replacement === "symlink" && process.platform === "win32" }, async (t) => {
    let parent, moved, other, destination;
    const f = fixture(t, { dialog: () => ({ filePath: destination }), print: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      fs.renameSync(parent, moved);
      if (replacement === "symlink") fs.symlinkSync(other, parent);
      else fs.mkdirSync(parent);
      return Buffer.from("new PDF");
    } });
    parent = path.join(f.directory, "selected"); moved = path.join(f.directory, "moved"); other = path.join(f.directory, "other");
    fs.mkdirSync(parent); fs.mkdirSync(other); destination = path.join(parent, "report.pdf");
    await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-destination/);
    assert.equal(fs.existsSync(destination), false); assert.deepEqual(fs.readdirSync(other), []);
    assert.deepEqual(fs.readdirSync(moved), []); assert.equal(f.windows[0].destroyed, true);
  });
}

test("canceled asynchronous disk work cannot commit late or open a replacement job", async (t) => {
  const began = deferred(), release = deferred(), ended = deferred();
  const f = fixture(t, { write: async (target, pdf, options) => {
    began.resolve(); await release.promise;
    try { await writeReportPdf(target, pdf, options); } finally { ended.resolve(); }
  } });
  const pending = f.service.exportReportPdf(f.event, request());
  await began.promise;
  assert.equal(f.service.cancelReportPdf(f.event, "owned-job-1"), true);
  assert.equal(await pending, "cancelled");
  assert.equal(f.windows[0].destroyed, true);
  await assert.rejects(f.service.exportReportPdf(f.event, { ...request(), id: "new-job" }), /pdf-busy/);
  release.resolve(); await ended.promise; await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fs.existsSync(f.destination), false); assert.deepEqual(fs.readdirSync(f.directory), []);
  assert.equal(await f.service.exportReportPdf(f.event, { ...request(), id: "new-job" }), "saved");
});

test("a parent replacement before commit never writes into the replacement directory", async (t) => {
  const f = fixture(t), selected = path.join(f.directory, "selected"), moved = path.join(f.directory, "moved");
  fs.mkdirSync(selected);
  const target = reportPdfDestination(path.join(selected, "report.pdf"));
  let checkpoints = 0;
  await assert.rejects(writeReportPdf(target, Buffer.from("owned PDF"), { beforeCommit() {
    if (++checkpoints === 3) { fs.renameSync(selected, moved); fs.mkdirSync(selected); }
  } }), /pdf-destination/);
  assert.deepEqual(fs.readdirSync(selected), []);
  const retained = fs.readdirSync(moved);
  assert.equal(retained.length, 1); assert.match(retained[0], /^\.grokoff-report-/);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(moved, retained[0])).mode & 0o777, 0o600);
});

for (const substitution of ["regular", "symlink"]) {
  test(`an awaited disk sync cannot commit an unproved ${substitution} temp replacement`, { skip: substitution === "symlink" && process.platform === "win32" }, async (t) => {
    const f = fixture(t), entered = deferred(), release = deferred();
    fs.writeFileSync(f.destination, "existing selected PDF");
    const target = reportPdfDestination(f.destination);
    const originalOpen = fs.promises.open;
    t.mock.method(fs.promises, "open", async (...args) => {
      const handle = await originalOpen(...args);
      const originalSync = handle.sync;
      t.mock.method(handle, "sync", async () => { entered.resolve(); await release.promise; return originalSync.call(handle); });
      return handle;
    });
    const pending = writeReportPdf(target, Buffer.from("owned new PDF"));
    await entered.promise;
    const temporary = path.join(f.directory, fs.readdirSync(f.directory).find((name) => name.startsWith(".grokoff-report-")));
    fs.unlinkSync(temporary);
    const other = path.join(f.directory, "unrelated.txt");
    if (substitution === "regular") fs.writeFileSync(temporary, "unproved replacement");
    else { fs.writeFileSync(other, "unrelated secret"); fs.symlinkSync(other, temporary); }
    release.resolve();
    await assert.rejects(pending, /pdf-destination/);
    assert.equal(fs.readFileSync(f.destination, "utf8"), "existing selected PDF");
    assert(fs.lstatSync(temporary)[substitution === "regular" ? "isFile" : "isSymbolicLink"]());
    if (substitution === "regular") assert.equal(fs.readFileSync(temporary, "utf8"), "unproved replacement");
    else assert.equal(fs.readFileSync(other, "utf8"), "unrelated secret");
  });
}

for (const code of ["EPERM", "EOPNOTSUPP"]) {
  test(`unsupported ${code} exclusive commit provides actionable failure without a destination or leaked temp`, async (t) => {
    const f = fixture(t);
    t.mock.method(fs, "linkSync", () => { throw Object.assign(new Error("fixture link failure"), { code }); });
    await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-filesystem/);
    assert.equal(fs.existsSync(f.destination), false); assert.deepEqual(fs.readdirSync(f.directory), []);
    assert.equal(f.windows[0].destroyed, true);
  });
}

test("a competing destination at exclusive commit stays intact", async (t) => {
  const f = fixture(t);
  t.mock.method(fs, "linkSync", (_from, destination) => {
    fs.writeFileSync(destination, "competing selected content");
    throw Object.assign(new Error("fixture destination race"), { code: "EEXIST" });
  });
  await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-destination/);
  assert.equal(fs.readFileSync(f.destination, "utf8"), "competing selected content");
  assert.deepEqual(fs.readdirSync(f.directory), ["report.pdf"]);
});

test("a filesystem that cannot enforce private file permissions is refused before commit", async (t) => {
  const f = fixture(t), originalOpen = fs.promises.open;
  t.mock.method(fs.promises, "open", async (...args) => {
    const handle = await originalOpen(...args), originalStat = handle.stat;
    t.mock.method(handle, "stat", async () => {
      const stat = await originalStat.call(handle); stat.mode = (stat.mode & ~0o777) | 0o644; return stat;
    });
    return handle;
  });
  await assert.rejects(f.service.exportReportPdf(f.event, request()), /pdf-filesystem/);
  assert.equal(fs.existsSync(f.destination), false); assert.deepEqual(fs.readdirSync(f.directory), []);
});
