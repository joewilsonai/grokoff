// SPDX-License-Identifier: Apache-2.0
// Native renderer driver for scripts/verify-math-renderer.ts only.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { app, BrowserWindow, session } from "electron";

const [url, output, scratch] = process.argv.slice(2);
assert.equal(new URL(url).hostname, "127.0.0.1");
assert.ok(isAbsolute(output) && isAbsolute(scratch));
app.setPath("userData", join(scratch, "user-data"));
app.setPath("sessionData", join(scratch, "user-data"));
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");

let win;
const blockedRequests = [], requestedFontAssets = [], rendererErrors = [], checks = [], geometry = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = (source) => win.webContents.executeJavaScript(source);
const until = async (source, description) => {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await evaluate(source)) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${description}`);
};

// Electron emits ready only after evaluating its ESM entry.
void app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest((request, callback) => {
    const target = new URL(request.url);
    // Vite's module client uses a WebSocket on the same owned listener.
    const allowed = ["http:", "ws:"].includes(target.protocol) && target.host === new URL(url).host;
    if (allowed && request.resourceType === "font") requestedFontAssets.push(target.pathname);
    if (!allowed) blockedRequests.push(request.url);
    callback({ cancel: !allowed });
  });
  try {
    win = new BrowserWindow({ show: false, width: 900, height: 1750, webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    } });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, target) => { if (target !== url) event.preventDefault(); });
    win.webContents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
    await win.loadURL(url);
    await until("document.querySelectorAll('[data-case]').length === 8", "all synthetic messages");
    await until("document.querySelector('[data-case=mermaid] svg .katex') !== null", "Mermaid math labels");
    await evaluate("document.fonts.ready");
    await pause(300);
    assert.equal(await evaluate("typeof process"), "undefined", "renderer has no Node capability");
    checks.push("isolated native renderer has no Node or preload access");
    for (const [id, minimum] of [["inline", 2], ["display", 1], ["matrix", 1], ["aligned", 1], ["long", 1]]) {
      assert.ok(await evaluate(`document.querySelector('[data-case=${id}]').querySelectorAll('.katex').length >= ${minimum}`), `${id} KaTeX output`);
      assert.equal(await evaluate(`document.querySelector('[data-case=${id}] .katex-error') === null`), true, `${id} valid TeX`);
    }
    checks.push("inline, alternate delimiters, display, matrix, multiline, and long equations render");
    assert.equal(await evaluate("document.querySelector('[data-case=invalid] .katex-error') !== null"), true, "invalid formula has contained fallback");
    assert.ok(await evaluate("document.querySelector('[data-case=invalid]').textContent.includes('leaves this sentence readable')"));
    checks.push("invalid TeX preserves surrounding prose");
    assert.equal(await evaluate("document.querySelectorAll('[data-case=trust] a, [data-case=trust] img, [data-case=trust] .injected-class').length"), 0);
    assert.equal(await evaluate("document.querySelectorAll('[data-case=trust] .katex').length"), 4);
    checks.push("untrusted href, url, includegraphics, and htmlClass produce no actionable link, image, or injected class");
    assert.equal(await evaluate("document.fonts.check('16px KaTeX_Main')"), true);
    assert.ok(await evaluate("getComputedStyle(document.querySelector('[data-case=inline] .katex')).fontFamily.includes('KaTeX_Main')"));
    assert.ok(requestedFontAssets.some((path) => path.includes("KaTeX_Main")), "KaTeX font asset requested from owned fixture");
    assert.ok(await evaluate("[...document.fonts].some(face => face.family.includes('KaTeX_Main') && face.status === 'loaded')"), "KaTeX font actually loaded");
    checks.push("production KaTeX CSS and fonts are loaded");
    for (const width of [900, 390]) {
      win.setContentSize(width, 1750);
      await pause(250);
      const measured = await evaluate(`(() => {
        const formulas = [...document.querySelectorAll('[data-case] .katex-display')].map(el => ({case:el.closest('[data-case]').dataset.case, width:el.clientWidth, scrollWidth:el.scrollWidth, overflowX:getComputedStyle(el).overflowX}));
        const cards = [...document.querySelectorAll('[data-case]')].map(el => { const r=el.getBoundingClientRect(); return {case:el.dataset.case,left:r.left,right:r.right,width:r.width}; });
        const mermaidLabels = [...document.querySelectorAll('[data-case=mermaid] svg .katex')].map(el => {
          const c=getComputedStyle(el), math=el.querySelector('math')?.getBoundingClientRect(), svg=el.closest('svg').getBoundingClientRect();
          return {text:el.textContent,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,overflowX:c.overflowX,overflowY:c.overflowY,
            math:math ? {left:math.left,right:math.right,top:math.top,bottom:math.bottom,width:math.width,height:math.height} : null,
            svg:{left:svg.left,right:svg.right,top:svg.top,bottom:svg.bottom}};
        });
        return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,formulas,cards,mermaidLabels};
      })()`);
      geometry.push(measured);
      assert.equal(measured.width, width);
      assert.ok(measured.pageWidth <= width, `${width}px page stays within viewport`);
      for (const card of measured.cards) assert.ok(card.left >= 0 && card.right <= width + 1, `${card.case} card stays within viewport`);
      const long = measured.formulas.find((item) => item.case === "long");
      assert.ok(long && long.scrollWidth > long.width, "long formula scrolls locally");
      assert.equal(long.overflowX, "auto");
      assert.equal(measured.mermaidLabels.length, 2, "both Mermaid math labels rendered");
      for (const label of measured.mermaidLabels) {
        // Native MathML may exceed the wrapper's line box. It must remain
        // visible instead of acquiring a scrollbar or clipping its glyphs.
        assert.equal(label.overflowX, "visible", `${width}px Mermaid label has no horizontal scrollbar`);
        assert.equal(label.overflowY, "visible", `${width}px Mermaid label has no vertical scrollbar`);
        assert.ok(label.math && label.math.width > 0 && label.math.height > 0, "native MathML has visible geometry");
        assert.ok(label.math.left >= label.svg.left && label.math.right <= label.svg.right &&
          label.math.top >= label.svg.top && label.math.bottom <= label.svg.bottom, "Mermaid math remains within its diagram");
      }
      writeFileSync(join(output, `math-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    checks.push("900px and 390px layouts keep page and cards within viewport while long display scrolls locally");
    checks.push("Mermaid native MathML stays visible without label scrollbars at both widths");
    assert.deepEqual(blockedRequests, [], "trust probes attempted no outbound requests");
    assert.deepEqual(rendererErrors, [], "renderer has no console errors");
    checks.push("Mermaid math labels render with no outbound request or renderer error");
    const receipt = { passed: true, createdAt: new Date().toISOString(), electronVersion: process.versions.electron,
      checks, geometry, requestedFontAssets, blockedRequests, rendererErrors,
      limitation: "Synthetic messages mounted in the real ChatMarkdown component and styles in a hidden native Electron window. This is a renderer acceptance fixture, not a packaged-app, full conversation, provider, or account integration test." };
    writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    win.destroy(); app.exit(0);
  } catch (error) {
    try { if (win && !win.isDestroyed()) writeFileSync(join(output, "failure.png"), (await win.webContents.capturePage()).toPNG()); } catch { /* Preserve the original failure. */ }
    try { if (win && !win.isDestroyed()) writeFileSync(join(output, "failure-dom.html"), await evaluate("document.body.innerHTML")); } catch { /* Preserve the original failure. */ }
    writeFileSync(join(output, "receipt.json"), JSON.stringify({ passed: false, error: String(error), checks, geometry, blockedRequests, rendererErrors }, null, 2) + "\n");
    console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1);
  }
});
