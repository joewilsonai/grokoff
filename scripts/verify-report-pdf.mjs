// GrokOff (2026-10-09): real PDF export/parse/render in an exclusively owned
// source Electron fixture. No provider, account, keychain or OS picker is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mountPreview } from "./testing/preview-fixture.ts";
import { reportPdfProcessIdentity, reportPdfProcessAlive, stopReportPdfChild, finishReportPdfHome } from "./testing/report-pdf-owners.mjs";

assert.equal(process.platform, "darwin", "This optional acceptance requires a Mac with installed Electron.");
const parserPath = process.env.OMB_VERIFY_PDFJS_MODULE;
const canvasPath = process.env.OMB_VERIFY_PDF_CANVAS_MODULE;
for (const file of [parserPath, canvasPath]) assert(file && path.isAbsolute(file) && fs.statSync(file).isFile(), "Set absolute OMB_VERIFY_PDFJS_MODULE and OMB_VERIFY_PDF_CANVAS_MODULE paths to already-installed PDF.js and @napi-rs/canvas modules.");
const { getDocument } = await import(pathToFileURL(parserPath).href);
const { createCanvas } = createRequire(import.meta.url)(canvasPath);
const root = fileURLToPath(new URL("..", import.meta.url));
const electron = createRequire(import.meta.url)("electron");
const output = path.join(root, ".local", `report-pdf-${Date.now()}`);
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const home = fs.mkdtempSync("/tmp/grokoff-report-pdf-");
fs.chmodSync(home, 0o700);
const token = randomUUID();
for (const name of ["home", "profile", "downloads", "tmp"]) fs.mkdirSync(path.join(home, name), { mode: 0o700 });
fs.writeFileSync(path.join(home, "owner-token"), token, { mode: 0o600 });
const receipt = { passed: false, home, output, token, startedAt: new Date().toISOString(), ownedPids: [], cleanup: {} };
const persist = () => fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
let child, ownerIdentity, preview, deadline, exitDeadline, stopping = false, launchError;
const stop = () => {
  stopping = true;
  try {
    if (stopReportPdfChild(child, ownerIdentity) === "unproven") receipt.cleanup.unprovenOwner = child.pid;
  } catch (error) { receipt.cleanup.ownershipError = String(error); }
  persist();
};
process.once("SIGINT", stop); process.once("SIGTERM", stop);
let requested = 0;
const report = ["# GrokOff synthetic PDF research", "Résumé · café · مرحبا بالعالم", "A finding with footnote evidence[^proof].\n\n[^proof]: SYNTHETIC_FOOTNOTE_EVIDENCE.", "[Evidence source](https://example.test/research)",
  "[Inert local link](file:///private/secret)", "[Inert JavaScript](javascript:alert%281%29)", "[Inert data link](data:text/html,secret)",
  "![Tracking image](https://example.test/pixel)", "<script>PRIVATE_SCRIPT_SENTINEL</script>",
  "| Item | Evidence |\n| --- | --- |\n| Cedar | 12-day review |\n| Maple | 8-day review |",
  "```text\nCODE_START " + "wrapped_code_segment_".repeat(100) + " CODE_END\n```",
  ...Array.from({ length: 120 }, (_, i) => `## PDF_SECTION_${String(i + 1).padStart(3, "0")}\n\nSynthetic evidence paragraph ${i + 1}. ` + "This line checks pagination and readable report continuity. ".repeat(8)),
].join("\n\n");
const transport = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/threads/pdf-thread/messages/pdf-message/file") { res.writeHead(404); res.end(); return; }
  let body = "";
  req.on("data", (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
  req.on("end", () => {
    if (body !== JSON.stringify({ path: "/synthetic/Research.md" })) { res.writeHead(403); res.end(); return; }
    requested++; res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" }); res.end(report);
  });
});
persist();
try {
  await new Promise((resolve) => transport.listen(0, "127.0.0.1", resolve));
  const address = transport.address(); assert(address && typeof address !== "string");
  preview = await mountPreview({ info: { url: `http://127.0.0.1:${address.port}` } }, {
    entry: "/scripts/testing/report-pdf-preview.tsx", route: "/__report-pdf.html", title: "GrokOff isolated PDF export", logLevel: "silent",
  });
  const configPath = path.join(home, "config.json");
  fs.writeFileSync(configPath, JSON.stringify({ home, token, output, previewUrl: preview.previewUrl }), { mode: 0o600 });
  if (stopping) throw new Error("Fixture cancelled before launch");
  const logs = [fs.openSync(path.join(output, "stdout.log"), "w", 0o600), fs.openSync(path.join(output, "stderr.log"), "w", 0o600)];
  try {
    child = spawn(electron, [path.join(root, "scripts/testing/report-pdf-desktop.mjs"), configPath, `--user-data-dir=${path.join(home, "profile")}`], {
      cwd: root, env: { PATH: process.env.PATH, HOME: path.join(home, "home"), USERPROFILE: path.join(home, "home"),
        TMPDIR: path.join(home, "tmp"), XDG_CONFIG_HOME: path.join(home, "home"), LANG: "en_US.UTF-8", OMB_SMOKE_TEST: "1" },
      stdio: ["ignore", logs[0], logs[1]],
    });
    const exited = new Promise((resolve) => { child.once("error", (error) => { launchError = error; resolve(null); }); child.once("exit", (code) => resolve(code)); });
    receipt.ownedPids = child.pid ? [child.pid] : [];
    ownerIdentity = child.pid ? reportPdfProcessIdentity(child.pid) : null;
    if (ownerIdentity && (!ownerIdentity.includes(configPath) || !ownerIdentity.includes(`--user-data-dir=${path.join(home, "profile")}`))) {
      ownerIdentity = null; receipt.cleanup.unprovenOwner = child.pid;
      throw new Error("Spawned Electron identity was not proven");
    }
    receipt.launch = { pid: child.pid, command: ownerIdentity, electron, configPath }; persist();
    deadline = setTimeout(stop, 90_000);
    const code = await Promise.race([exited, new Promise((_, reject) => { exitDeadline = setTimeout(() => reject(new Error("Owned Electron failed to exit after its deadline")), 95_000); })]);
    clearTimeout(deadline);
    if (launchError) throw launchError;
    const desktop = JSON.parse(fs.readFileSync(path.join(output, "desktop.json"), "utf8"));
    assert.equal(desktop.mainPid, child.pid); assert.equal(desktop.ownerToken, token);
    receipt.ownedPids = [...new Set([...receipt.ownedPids, ...desktop.ownedPids])]; receipt.desktop = desktop; persist();
    assert.equal(code, 0); assert.equal(desktop.passed, true); assert.equal(requested, 1);
  } finally { clearTimeout(deadline); clearTimeout(exitDeadline); for (const fd of logs) fs.closeSync(fd); }
  const pdfPath = path.join(home, "downloads", "Research.pdf");
  assert.equal(fs.statSync(pdfPath).mode & 0o777, 0o600, "The actual PDF must be private");
  const bytes = fs.readFileSync(pdfPath);
  const document = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false }).promise;
  try {
    assert(document.numPages >= 3, "PDF must actually paginate");
    let text = ""; const links = [], pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str ?? "").join(" ") + "\n";
      links.push(...(await page.getAnnotations()).filter((item) => item.subtype === "Link").map((item) => item.url));
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), canvas, viewport }).promise;
      const image = path.join(output, `pdf-page-${String(number).padStart(2, "0")}.png`);
      fs.writeFileSync(image, canvas.toBuffer("image/png"), { mode: 0o600 }); pages.push({ number, image });
      page.cleanup();
    }
    for (let i = 1; i <= 120; i++) assert(text.includes(`PDF_SECTION_${String(i).padStart(3, "0")}`), `Missing report section ${i}`);
    assert(text.includes("Résumé") && text.includes("CODE_START") && text.includes("CODE_END") && text.includes("SYNTHETIC_FOOTNOTE_EVIDENCE"));
    assert(!text.includes("PRIVATE_OTHER_CHAT_SENTINEL"));
    assert(links.includes("https://example.test/research"));
    assert(links.every((url) => typeof url === "string" && /^https?:\/\//.test(url)), "Only HTTP(S) citation annotations survive");
    fs.copyFileSync(pdfPath, path.join(output, "Research.pdf")); fs.chmodSync(path.join(output, "Research.pdf"), 0o600);
    receipt.pdf = { pages, numPages: document.numPages, links, all120Sections: true, otherChatAbsent: true,
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, mode: fs.statSync(pdfPath).mode & 0o777 };
    receipt.passed = true;
  } finally { await document.destroy(); }
} catch (error) { receipt.error = String(error); process.exitCode = 1; }
finally {
  clearTimeout(deadline); stop();
  if (child?.pid && reportPdfProcessAlive(child.pid)) await new Promise((resolve) => { const limit = setTimeout(resolve, 5000); child.once("exit", () => { clearTimeout(limit); resolve(); }); });
  await preview?.close(); await new Promise((resolve) => transport.close(resolve));
  receipt.cleanup = { ...receipt.cleanup, ...finishReportPdfHome(home, token, receipt.ownedPids, receipt.cleanup.unprovenOwner || receipt.cleanup.ownershipError) };
  if (!receipt.cleanup.homeRemoved) { receipt.passed = false; process.exitCode = 1; }
  process.off("SIGINT", stop); process.off("SIGTERM", stop); persist();
  console.log(JSON.stringify({ passed: receipt.passed, receipt: path.join(output, "receipt.json") }));
}
