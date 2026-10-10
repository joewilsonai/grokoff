// GrokOff: owned source renderer + production preload/PDF module. Invoked only
// by verify-report-pdf.mjs; the native Save dialog is a disposable stand-in.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, session } from "electron";
import { createReportPdfService } from "../../electron/report-pdf.mjs";

const configPath = process.argv[2];
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = fileURLToPath(new URL("../..", import.meta.url));
assert.equal(process.platform, "darwin");
assert(config.home.startsWith("/tmp/grokoff-report-pdf-"));
assert.equal(path.dirname(configPath), config.home);
assert.equal(fs.readFileSync(path.join(config.home, "owner-token"), "utf8"), config.token);
assert.equal(new URL(config.previewUrl).hostname, "127.0.0.1");
app.setName("GrokOff PDF fixture");
app.setPath("home", path.join(config.home, "home"));
app.setPath("userData", path.join(config.home, "profile"));
app.setPath("sessionData", path.join(config.home, "profile"));
app.setPath("downloads", path.join(config.home, "downloads"));
app.commandLine.appendSwitch("disable-background-networking");
let win, service;
const printWindows = [], printContentsIds = [], resourceRequests = [], owners = new Set([process.pid]);
const receipt = { passed: false, mainPid: process.pid, execPath: process.execPath, argv: process.argv,
  ownerToken: config.token, nativeSaveDialog: false, activation: "Visible/hit-tested DOM.click in the owned renderer",
  limitation: "Source report component, production preload and PDF service with Chromium are real. Message-file transport and Save-dialog selection are synthetic. This is not packaged bootstrap, native picker, live-provider or release acceptance." };
const collect = () => { for (const process of app.getAppMetrics()) owners.add(process.pid); receipt.ownedPids = [...owners]; };
const persist = () => { collect(); fs.writeFileSync(path.join(config.output, "desktop.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 }); };
const until = async (check, label) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timed out: ${label}`);
};
const evaluate = (code) => win.webContents.executeJavaScript(code);
const button = (label) => `[...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)})`;
const click = async (label) => {
  await until(() => evaluate(`Boolean(${button(label)} && !${button(label)}.disabled)`), label);
  await evaluate(`(() => { const el = ${button(label)}; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect();
    if (!r.width || !r.height || r.left<0 || r.top<0 || r.right>innerWidth || r.bottom>innerHeight || !el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))) throw new Error('Target not visibly actionable'); el.click(); })()`);
};
const capture = async (name) => {
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  fs.writeFileSync(path.join(config.output, `${name}.png`), (await win.webContents.capturePage()).toPNG(), { mode: 0o600 });
};
process.once("SIGTERM", () => { service?.dispose(); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); });

// Let the ESM entry finish so Electron can emit ready; waiting at module scope
// blocks startup before any owned renderer or print surface can be created.
void app.whenReady().then(async () => {
persist();
try {
  const local = new URL(config.previewUrl).origin;
  const blockedRendererRequests = [];
  session.defaultSession.webRequest.onBeforeRequest((request, callback) => {
    const url = new URL(request.url);
    const allowed = ["http:", "ws:"].includes(url.protocol) && url.host === new URL(local).host;
    if (!allowed) blockedRendererRequests.push(url.origin);
    callback({ cancel: !allowed });
  });
  class PrintWindow extends BrowserWindow {
    constructor(options) {
      super(options);
      printWindows.push(this); printContentsIds.push(this.webContents.id); collect();
      // Observe the production deny callback without weakening it.
      const requests = this.webContents.session.webRequest;
      const install = requests.onBeforeRequest.bind(requests);
      requests.onBeforeRequest = (filter, handler) => install(filter, (details, callback) => {
        handler(details, (decision) => {
          resourceRequests.push({ protocol: new URL(details.url).protocol, resourceType: details.resourceType,
            webContentsId: details.webContentsId, cancelled: decision.cancel });
          callback(decision);
        });
      });
    }
  }
  let choices = 0;
  service = createReportPdfService({ BrowserWindow: PrintWindow, getOwner: () => win, getLocalOrigin: () => local,
    getDownloads: () => path.join(config.home, "downloads"), dialog: { async showSaveDialog(owner, options) {
      assert.equal(owner, win); assert(options.properties.includes("showOverwriteConfirmation"));
      choices++;
      return choices === 1 ? { canceled: true } : { filePath: path.join(config.home, "downloads", "Research.pdf") };
    } } });
  ipcMain.handle("desktop:export-report-pdf", service.exportReportPdf);
  ipcMain.handle("desktop:cancel-report-pdf", service.cancelReportPdf);
  win = new BrowserWindow({ show: false, width: 1100, height: 820, webPreferences: {
    preload: path.join(root, "electron", "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false,
    backgroundThrottling: false,
    additionalArguments: [`--omb-local-origin=${local}`],
  } });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await win.loadURL(config.previewUrl); collect(); persist();
  assert.equal(await evaluate("typeof window.require"), "undefined");
  assert.equal(await evaluate("typeof window.ogb.exportReportPdf"), "function");
  await click("Open report: Research.md");
  await until(() => evaluate("document.querySelector('[data-testid=report-content]')?.textContent.includes('PDF_SECTION_120')"), "complete report");
  await capture("report");
  await click("Save PDF");
  await until(() => evaluate(`Boolean(${button("Save PDF")} && !${button("Save PDF")}.disabled)`), "cancelled export recovered");
  assert(await evaluate("Boolean(document.querySelector('dialog')) && !document.querySelector('dialog [role=alert], dialog [role=status]')"), "Cancellation must leave no export error or status");
  assert.equal(printWindows.length, 0); assert(!fs.existsSync(path.join(config.home, "downloads", "Research.pdf")));
  win.setContentSize(390, 820);
  await until(() => evaluate("innerWidth === 390"), "narrow reader");
  assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
  await capture("narrow");
  await click("Save PDF");
  await until(() => evaluate("[...document.querySelectorAll('[role=status]')].some(el => el.textContent === 'PDF saved.')"), "PDF completion");
  collect();
  assert.equal(choices, 2); assert.equal(printWindows.length, 1); assert(printWindows[0].isDestroyed());
  assert.deepEqual(resourceRequests, [{ protocol: "data:", resourceType: "mainFrame", webContentsId: printContentsIds[0], cancelled: false }]);
  assert.deepEqual(blockedRendererRequests, []);
  const attempts = choices;
  const refused = await evaluate("window.ogb.exportReportPdf({id:'malicious',name:'report.md',content:{tag:'article',children:[{tag:'img',children:[],href:'file:///private/secret'}]}}).then(()=>false,()=>true)");
  assert.equal(refused, true); assert.equal(choices, attempts);
  await capture("saved");
  receipt.passed = true;
  Object.assign(receipt, { productionPreload: true, reportLoaded: true, quietCancellation: true, narrowReader: true,
    printWindowsDestroyed: true, maliciousSnapshotRejected: true, resourceRequests, blockedRendererRequests });
} catch (error) {
  receipt.error = String(error);
  if (win && !win.isDestroyed()) await capture("failure").catch(() => {});
} finally {
  service?.dispose(); collect();
  for (const window of printWindows) if (!window.isDestroyed()) window.destroy();
  if (win && !win.isDestroyed()) win.destroy();
  receipt.windowsClosed = BrowserWindow.getAllWindows().length === 0;
  persist();
  app.exit(receipt.passed && receipt.windowsClosed ? 0 : 1);
}
});
