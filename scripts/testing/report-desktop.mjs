// GrokOff isolated native renderer. Invoked only by verify-browser-report.ts.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, session } from "electron";

const [configPath, phase] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const root = fileURLToPath(new URL("../..", import.meta.url));
assert(["initial", "restored"].includes(phase));
assert(config.desktopHome.startsWith("/tmp/grokoff-report-desktop-"));
assert(config.dataDir.startsWith("/tmp/openmausbot-verify-data-"));
assert.equal(dirname(configPath), config.desktopHome);
for (const value of [config.previewUrl, config.serverUrl]) assert.equal(new URL(value).hostname, "127.0.0.1");
app.setName("GrokOff report fixture");
app.setPath("home", join(config.desktopHome, "home"));
app.setPath("userData", join(config.desktopHome, "profile"));
app.setPath("sessionData", join(config.desktopHome, "profile"));
app.setPath("downloads", join(config.desktopHome, "downloads"));
app.commandLine.appendSwitch("disable-background-networking");
process.once("SIGTERM", () => app.exit(1));
const sockets = [];
let win;
const until = async (check, label) => {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  throw new Error(`Timed out: ${label}`);
};
const api = async (method, path, body) => {
  const response = await fetch(config.serverUrl + path, { method, headers: { "content-type": "application/json", origin: config.serverUrl },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  const value = await response.json();
  assert(response.ok, JSON.stringify(value));
  return value;
};
const evaluate = code => win.webContents.executeJavaScript(code);
const button = label => `[...document.querySelectorAll('button')].find(el => el.getClientRects().length && (el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)}))`;
const click = async label => {
  await until(() => evaluate(`Boolean(${button(label)})`), `button ${label}`);
  await evaluate(`${button(label)}.click()`);
};
const capture = async name => writeFileSync(join(config.output, `${phase}-${name}.png`), (await win.webContents.capturePage()).toPNG());
const ask = async (path, suffix) => {
  const socket = connect(path);
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  const id = randomUUID();
  const reply = new Promise((resolve, reject) => {
    let buffer = "";
    socket.once("error", reject);
    socket.once("close", () => reject(new Error("Approval socket closed before answering")));
    socket.setTimeout(25_000, () => socket.destroy(new Error("Approval reply timed out")));
    socket.on("data", chunk => {
      buffer += chunk;
      if (!buffer.includes("\n")) return;
      socket.setTimeout(0);
      resolve(JSON.parse(buffer.split("\n")[0]));
    });
  });
  void reply.catch(() => {});
  // Only the broker request is sent; this command is never executed.
  socket.write(JSON.stringify({ t: "ask", id, tool: "Bash", input: { command: `printf 'fixture approval ${suffix}'` } }) + "\n");
  return { id, reply };
};

void app.whenReady().then(async () => {
try {
  const local = new URL(config.previewUrl).origin;
  const blocked = [];
  session.defaultSession.webRequest.onBeforeRequest((request, callback) => {
    const url = new URL(request.url);
    const allowed = (["http:", "ws:"].includes(url.protocol) && [new URL(local).host, new URL(config.serverUrl).host].includes(url.host)) || ["blob:", "data:"].includes(url.protocol);
    if (!allowed) blocked.push(url.origin);
    callback({ cancel: !allowed });
  });
  const downloads = [];
  session.defaultSession.on("will-download", (_event, item) => {
    const destination = join(config.desktopHome, "downloads", `${phase}-${item.getFilename()}`);
    item.setSavePath(destination);
    item.once("done", (_doneEvent, state) => {
      downloads.push({ state, sha256: state === "completed" ? createHash("sha256").update(readFileSync(destination)).digest("hex") : null });
    });
  });
  const inertHandlers = {
    "workspaces:state": () => ({ current: { id: "local", name: "This computer" }, remote: false }),
    "desktop:capabilities": () => createRequire(import.meta.url)("../../electron/capabilities.cjs").desktopCapabilities({ platform: process.platform }),
    "desktop-remote:state": () => ({ active: false }),
    "companion:state": () => ({ running: false, enabled: false, devices: [], bind: null, publicUrl: null }),
    "update:get-state": () => ({ status: "idle" }),
    "cloud:state": () => ({ state: "signed-out" }),
    "perm:status": () => ({ accessibility: false, screen: false }),
    "desktop:skin": () => undefined,
    "window:state": () => ({ maximized: false }),
  };
  for (const [channel, handler] of Object.entries(inertHandlers)) ipcMain.handle(channel, handler);
  win = new BrowserWindow({ show: false, width: 1240, height: 920, webPreferences: {
    preload: join(root, "electron/preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false,
    additionalArguments: [`--omb-local-origin=${local}`],
  } });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await win.loadURL(config.previewUrl);
  assert.equal(await evaluate("typeof window.require"), "undefined");
  assert.equal(await evaluate("typeof window.ogb.getCapabilities"), "function");
  await click("Open report: browser-report.md");
  await until(() => evaluate(`document.querySelector('[data-testid="report-content"]')?.textContent.includes(${JSON.stringify(config.sourceNonce)})`), "rendered native browser evidence in report");
  const body = await evaluate("document.querySelector('[data-testid=report-content]').textContent");
  assert(body.includes("12-day") && body.includes("8-day"));
  const links = await evaluate("[...document.querySelectorAll('[data-testid=report-content] a')].map(el => el.href)");
  assert(config.sourceUrls.every(url => links.includes(url)), "Both source citations preserve their link targets");
  await capture("report");
  await click("Download report");
  await until(() => Promise.resolve(downloads.length === 1), "real Chromium file download completed");
  assert.deepEqual(downloads[0], { state: "completed", sha256: config.reportHash });
  win.setContentSize(390, 850);
  await until(() => evaluate("innerWidth === 390"), "narrow viewport applied");
  assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"), "No narrow document overflow");
  assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 1, "Exactly one native report dialog is open");
  assert(await evaluate("(() => { const r = document.querySelector('dialog[open]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()"), "Report dialog remains inside narrow viewport");
  await capture("narrow");
  await click("Close report");
  win.setContentSize(1240, 920);
  const approvals = [];
  if (phase === "initial") {
    await api("PATCH", "/api/instances/claude", { cli: config.hangCli });
    const dumpPath = join(config.dataDir, "fake-claude-dump.json");
    rmSync(dumpPath, { force: true });
    await until(() => evaluate("Boolean(document.querySelector('textarea[aria-label=\"Message Pepper\"]'))"), "real composer ready");
    await evaluate(`(() => { const el = document.querySelector('textarea[aria-label="Message Pepper"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'Hold this fixture turn for approval and Stop checks.'); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); })()`);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "ENTER" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "ENTER" });
    await until(() => Promise.resolve(existsSync(dumpPath)), "scripted provider turn started from composer");
    const launch = JSON.parse(readFileSync(dumpPath, "utf8"));
    const socketPath = launch.mcpConfig.mcpServers.ogb.args.at(-1);
    for (const [label, behavior] of [["Allow once", "allow"], ["Deny", "deny"]]) {
      const request = await ask(socketPath, behavior);
      await until(() => evaluate(`document.querySelector('[role="region"][aria-label="Pending approval"]')?.textContent.includes(${JSON.stringify(`fixture approval ${behavior}`)})`), `current ${behavior} request is rendered`);
      await click(label);
      const answer = await request.reply;
      assert.equal(answer.behavior, behavior);
      approvals.push({ expected: behavior, actual: answer.behavior });
    }
    const pending = await ask(socketPath, "stop");
    await until(() => evaluate(`document.querySelector('[role="region"][aria-label="Pending approval"]')?.textContent.includes('fixture approval stop')`), "pending approval before Stop");
    await capture("approval");
    await click("Cancel turn");
    assert.equal((await pending.reply).behavior, "deny", "Stop denies the pending permission");
    await until(async () => {
      const result = await api("GET", "/api/bots?messages=0");
      return !result.bots.find(bot => bot.id === config.botId)?.busy;
    }, "server confirms stopped turn");
    approvals.push({ expected: "deny-on-stop", actual: "deny" });
    // With no permission pending, the ordinary Stop control follows the same
    // cancellation path. Drive it too rather than equating its label to Cancel.
    await until(() => evaluate("Boolean(document.querySelector('textarea[aria-label=\"Message Pepper\"]'))"), "composer returns after cancellation");
    rmSync(dumpPath, { force: true });
    await evaluate(`(() => { const el = document.querySelector('textarea[aria-label="Message Pepper"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'Hold one more deterministic turn for the Stop control.'); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); })()`);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "ENTER" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "ENTER" });
    await until(() => Promise.resolve(existsSync(dumpPath)), "second provider turn actually started before Stop");
    await click("Stop this turn");
    await until(async () => !(await api("GET", "/api/bots?messages=0")).bots.find(bot => bot.id === config.botId)?.busy, "ordinary Stop ends the turn");
    await capture("stopped");
  }
  assert.deepEqual(blocked, [], "The fixture renderer attempted an unexpected external request");
  writeFileSync(join(config.output, `${phase}.json`), JSON.stringify({ passed: true, productionPreload: true, fullApp: true,
    reportRendered: true, citationLinks: links.length, download: downloads[0], narrowLayout: true, approvals,
    limitation: "Native window and real renderer; optional desktop IPC answers are inert fixtures. Model reasoning and command execution are not part of this check." }, null, 2));
  app.exit(0);
} catch (error) {
  console.error(error);
  if (win && !win.isDestroyed()) {
    await capture("failure").catch(() => {});
    console.error(await evaluate("document.body.innerText").catch(() => "Renderer unavailable"));
  }
  app.exit(1);
} finally {
  for (const socket of sockets) socket.destroy();
}
});
