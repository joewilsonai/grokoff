import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, session } from "electron";

const [url, output, scratch] = process.argv.slice(2);
app.setPath("userData", join(scratch, "user-data"));
app.setPath("sessionData", join(scratch, "user-data"));
app.commandLine.appendSwitch("disable-background-networking");
const origin = new URL(url).origin;
const blocked = [];
const errors = [];
const errorCopy = "Couldn't check your connections. Showing the last known status. Try again.";
app.whenReady().then(async () => {
session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
session.defaultSession.setPermissionCheckHandler(() => false);
session.defaultSession.webRequest.onBeforeRequest((request, callback) => {
  const target = new URL(request.url);
  const allowed = ["http:", "ws:"].includes(target.protocol) && target.host === new URL(url).host;
  if (!allowed) blocked.push(request.url);
  callback({ cancel: !allowed });
});
const win = new BrowserWindow({ show: false, width: 900, height: 880, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
win.webContents.on("will-navigate", (event, target) => { if (target !== url) event.preventDefault(); });
win.webContents.on("console-message", (event) => { if (event.level === "error") errors.push(event.message); });
const evaluate = (code) => win.webContents.executeJavaScript(code);
const until = async (check, description) => {
  for (let i = 0; i < 700; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${description}`);
};
const button = (label, scope = "document") => `[...${scope}.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)})`;
const card = (id) => `document.querySelector('[data-engine-card="${id}"]')`;
const scope = (target) => target === "global" ? "document" : card(target);
const control = async (mode, revision) => {
  const response = await session.defaultSession.fetch(`${origin}/__fixture/mode`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, revision }) });
  assert.equal(response.status, 200);
};
const stats = () => session.defaultSession.fetch(`${origin}/__fixture/stats`).then((response) => response.json());
const receivedInventory = () => evaluate("performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname === '/api/instances').length");
try {
  await win.loadURL(url);
  await until(() => evaluate("document.body.textContent.includes('claude@example.test') && document.body.textContent.includes('codex@example.test')"), "initial inventory");
  for (const id of ["claude", "codex"]) await evaluate(`${card(id)}.open = true`);
  // Keep a real add-account draft mounted through failures and state updates.
  await evaluate(`${button("Add Claude account", card("claude"))}.click()`);
  await until(() => evaluate(`${card("claude")}.querySelector('input') !== null`), "account draft form");
  const draftInput = `[...${card("claude")}.querySelectorAll('form')].at(-1).querySelector('input')`;
  await evaluate(`(() => { const input = ${draftInput}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Keep this draft'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const checks = [];
  for (const width of [900, 390]) {
    win.setSize(width, 880);
    await until(() => evaluate(`innerWidth === ${width}`), "viewport resize");
    for (const target of ["global", "claude", "codex"]) {
      // Clear prior check errors via each control's successful retry before
      // changing the endpoint, so every target proves its own failure alert.
      const label = target === "global" ? "Check again" : "Check account";
      const selected = button(label, scope(target));
      await control("failed", 0);
      await evaluate(`${selected}.click()`);
      await until(() => evaluate(`[...${scope(target)}.querySelectorAll('[role=alert]')].some(el => el.textContent === ${JSON.stringify(errorCopy)}) && !${selected}.disabled`), `${target} failure at ${width}px`);
      assert.equal(await evaluate("document.body.textContent.includes('claude@example.test') && document.body.textContent.includes('codex@example.test')"), true, "last identities retained");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "narrow failure layout");
      if (target === "global") writeFileSync(join(output, `provider-refresh-error-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await control("ready", 1);
      await evaluate(`${selected}.click()`);
      await until(() => evaluate(`!${scope(target)}.querySelector('[role=alert]') && document.body.textContent.includes('claude-new@example.test') && document.body.textContent.includes('codex-new@example.test')`), `${target} retry at ${width}px`);
      await evaluate(`${card("claude")}.open = false; ${card("claude")}.open = true`);
      assert.equal(await evaluate(`${draftInput}.value`), "Keep this draft", "account draft retained");
      await control("ready", 0);
      await evaluate(`${selected}.click()`);
      await until(() => evaluate("document.body.textContent.includes('claude@example.test')"), "identity reset");
      checks.push({ width, target, failureAndRetry: true, retainedStatusAndDraft: true });
    }
  }
  await control("pending", 0);
  const beforeTimeout = await stats();
  await evaluate(`${button("Check again")}.click()`);
  await until(() => evaluate(`Boolean(${button("Checking…")}) && ${button("Checking…")}.disabled`), "hung check busy");
  const started = Date.now();
  await until(() => evaluate(`Boolean(${button("Check again")}) && !${button("Check again")}.disabled && document.body.textContent.includes(${JSON.stringify(errorCopy)})`), "hung check deadline");
  assert.ok(Date.now() - started < 13_000, "check bounded to shared ten-second deadline");
  await until(async () => (await stats()).pendingClosed > beforeTimeout.pendingClosed, "timed-out request closes while the fixture window is still alive");
  assert.equal(win.isDestroyed(), false, "deadline cleanup precedes window destruction");
  await control("ready", 1);
  await evaluate(`${button("Check again")}.click()`);
  await until(() => evaluate("!document.querySelector('[role=alert]') && document.body.textContent.includes('claude-new@example.test')"), "retry after timeout");
  writeFileSync(join(output, "provider-refresh-narrow.png"), (await win.webContents.capturePage()).toPNG());
  await control("failed", 1);
  const beforeFocus = await stats();
  const beforeReceived = await receivedInventory();
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await until(async () => {
    const current = await stats();
    return current.started > beforeFocus.started && current.failed > beforeFocus.failed && await receivedInventory() > beforeReceived;
  }, "focus inventory GET returns its complete 503 response");
  assert.equal(await evaluate("document.querySelector('[role=alert]') === null"), true, "background refresh quiet");
  assert.equal(await evaluate(`${draftInput}.value`), "Keep this draft");
  assert.deepEqual(blocked, [], "external request attempted");
  assert.deepEqual(errors, [], "renderer console errors");
  writeFileSync(join(output, "renderer-receipt.json"), `${JSON.stringify({ passed: true, checks, deadlineAndRetry: true, deadlineSocketClosedBeforeWindowExit: true, backgroundQuietAfterCompleted503: true, externalRequests: blocked, rendererErrors: errors, limitation: "Synthetic inventory only; provider authentication and real inference are not exercised." }, null, 2)}\n`);
  win.destroy();
  app.exit(0);
} catch (error) {
  writeFileSync(join(output, "failure.png"), (await win.webContents.capturePage()).toPNG());
  console.error(error, await evaluate("document.body.innerText"));
  win.destroy();
  app.exit(1);
}
}).catch((error) => { console.error(error); app.exit(1); });
