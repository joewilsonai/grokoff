// GrokOff: deterministic browser/report acceptance in a disposable workspace.
// Native browser reads are real. Provider decisions and report composition are scripted.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closeBrowserSession } from "../server/browser-engine.ts";
import { BrowserRuntime, browserCommandEnv, defaultBrowserSocketDirectory } from "../server/browser-runtime.ts";
import { waitForExit } from "../server/testing/cleanup.ts";
import { launchVerificationServer, runControlOmb, verificationServerEnvironment } from "./control-omb.ts";
import { fixtureApi, mountPreview, type MountedPreview } from "./testing/preview-fixture.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const binaryPath = process.env.OMB_VERIFY_BROWSER_BINARY;
const executablePath = process.env.OMB_VERIFY_BROWSER_CHROME;
assert(binaryPath && executablePath, "Set OMB_VERIFY_BROWSER_BINARY and OMB_VERIFY_BROWSER_CHROME to installed native binaries.");
const output = join(root, ".local", `browser-report-${Date.now()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
const desktopHome = mkdtempSync("/tmp/grokoff-report-desktop-");
for (const name of ["home", "profile", "downloads"]) mkdirSync(join(desktopHome, name));
const fixture = await launchVerificationServer({}, undefined, undefined, { binaryPath, executablePath });
const api = fixtureApi(fixture.info.url, { headers: { origin: fixture.info.url } });
const runtime = new BrowserRuntime();
const browserSession = `report-${randomUUID()}`;
const browserEnv = browserCommandEnv({
  HOME: fixture.info.dataDir, USERPROFILE: fixture.info.dataDir, PATH: process.env.PATH,
  AGENT_BROWSER_SESSION: browserSession, AGENT_BROWSER_HEADLESS: "1",
  AGENT_BROWSER_EXECUTABLE_PATH: executablePath, AGENT_BROWSER_NO_WEBMCP: "1",
  AGENT_BROWSER_NAMESPACE: "grokoff",
  AGENT_BROWSER_SOCKET_DIR: defaultBrowserSocketDirectory({ HOME: fixture.info.dataDir, AGENT_BROWSER_NAMESPACE: "grokoff" }),
});
let ui: MountedPreview | undefined;
let restarted: ChildProcess | undefined;
let desktop: ChildProcess | undefined;
const receipt: Record<string, unknown> = {
  startedAt: new Date().toISOString(), evidence: output,
  ownedFixture: { ...fixture.info, desktopHome, browserSession, socketDirectory: browserEnv.AGENT_BROWSER_SOCKET_DIR },
  limitation: "Native browser and Electron renderer/preload are real. Report composition, provider events and approval requests are deterministic fixtures. This does not prove live-provider planning or the complete packaged app bootstrap.",
};
const persist = () => writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
persist();
const control = (args: string[]) => runControlOmb([...args, "--url", fixture.info.url], { env: {} });
const until = async (check: () => Promise<boolean>, label: string) => {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
};
const stop = () => { desktop?.kill("SIGTERM"); restarted?.kill("SIGTERM"); fixture.child.kill("SIGTERM"); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const sourceNonce = randomUUID();
  const sources = [
    { path: "/__report-source/one", title: "Cedar project notes", fact: "Cedar has a 12-day review window." },
    { path: "/__report-source/two", title: "Maple project notes", fact: "Maple has an 8-day review window." },
  ];
  const requestedSources: string[] = [];
  ui = await mountPreview(fixture, {
    entry: "/scripts/testing/threads-preview.tsx", route: "/__browser-report.html", title: "GrokOff isolated report verification", logLevel: "silent",
    extraRoutes: sources.map(source => ({ path: source.path, handler(_req, res) {
      requestedSources.push(source.path);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html><title>${source.title}</title><main><h1>${source.title}</h1><p>${source.fact}</p><p>Evidence nonce: ${sourceNonce}</p></main>`);
    } })),
  });
  const spec = { command: binaryPath, args: ["mcp", "--tools", "core", "--no-webmcp"], env: browserEnv };
  const browserCalls: Array<{ name: string; source: string; sha256: string }> = [];
  const readings: string[] = [];
  for (const source of sources) {
    const url = new URL(source.path, ui.previewUrl).href;
    for (const [name, args] of [["open", { url }], ["get_text", { selector: "main" }]] as const) {
      const result = await runtime.agentRpc(browserSession, spec, "tools/call", { name: `agent_browser_${name}`, arguments: args }) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
      assert(!result.isError, JSON.stringify(result));
      const text = (result.content ?? []).map(item => item.text ?? "").join("\n");
      browserCalls.push({ name, source: url, sha256: createHash("sha256").update(text).digest("hex") });
      if (name === "get_text") {
        assert(text.includes(sourceNonce) && text.includes(source.fact), "Native browser must read the fresh source content");
        readings.push(text);
      }
    }
  }
  assert(sources.every(source => requestedSources.includes(source.path)));
  receipt.nativeBrowser = { calls: browserCalls, sourceRequests: requestedSources, nonceMatched: true };
  const { bots } = await api("GET", "/api/bots?messages=0");
  const bot = bots[0];
  await api("PATCH", `/api/bots/${bot.id}/profile`, { name: "Pepper" });
  const workspace = join(fixture.info.dataDir, "report-workspace");
  mkdirSync(workspace);
  await api("PATCH", `/api/bots/${bot.id}`, { cwd: workspace, browser: true });
  await api("PATCH", "/api/config", { language: "en", features: { browser: true, showToolCalls: true, llmThreadTitles: false, autoRecall: false } });
  const reportPath = join(workspace, "browser-report.md");
  const report = `# Browser research report\n\nThis deterministic acceptance report uses content read by the native browser.\n\n${sources.map((source, index) => `## ${source.title}\n\n${readings[index]}\n\n[${source.title}](${new URL(source.path, ui!.previewUrl).href})`).join("\n\n")}\n\n| Project | Review window |\n| --- | --- |\n| Cedar | 12 days |\n| Maple | 8 days |\n`;
  writeFileSync(reportPath, report);
  const reportHash = createHash("sha256").update(report).digest("hex");
  const fakeModule = pathToFileURL(join(root, "server/testing/fake-claude-cli.ts")).href;
  const makeWrapper = (name: string, env: Record<string, string>) => {
    const path = join(fixture.info.dataDir, name);
    writeFileSync(path, ["#!/usr/bin/env node", ...Object.entries(env).map(([key, value]) => `process.env[${JSON.stringify(key)}] = ${JSON.stringify(value)};`), `await import(${JSON.stringify(fakeModule)});`].join("\n"), { mode: 0o700 });
    return path;
  };
  const cli = makeWrapper("report-claude.mjs", {
    FAKE_CLAUDE_REPLIES: JSON.stringify([`The fixture read both source pages. [Open the research report](${reportPath})`]),
    FAKE_CLAUDE_TOOL_CALLS: JSON.stringify([{ name: "browser_read", input: { sources: sources.length }, output: "Deterministic provider event; native browser receipts are recorded separately.", ok: true }]),
  });
  const hangCli = makeWrapper("report-hang-claude.mjs", { FAKE_CLAUDE_MODE: "hang", FAKE_CLAUDE_TOOL_CALLS: "[]" });
  await api("PATCH", "/api/instances/claude", { cli });
  await control(["send", "--bot", bot.id, "--task", bot.threadId, "--text", "Prepare the sourced browser research report from the controlled fixture pages."]);
  const settled = await control(["wait", "--bot", bot.id, "--task", bot.threadId, "--timeout", "30"]) as { status: string };
  assert.equal(settled.status, "settled");
  const saved = await api("GET", `/api/threads/${bot.threadId}/messages?limit=100`);
  const message = saved.messages.find((item: { kind?: string; text?: string }) => item.kind === "text" && item.text?.includes(reportPath));
  assert(message, "The report must be linked in a persisted assistant message");
  const configPath = join(desktopHome, "acceptance.json");
  writeFileSync(configPath, JSON.stringify({ previewUrl: ui.previewUrl, serverUrl: fixture.info.url, output, desktopHome,
    dataDir: fixture.info.dataDir, botId: bot.id, threadId: bot.threadId, messageId: message.id,
    reportHash, sourceNonce, hangCli, sourceUrls: sources.map(source => new URL(source.path, ui!.previewUrl).href) }), { mode: 0o600 });
  const runDesktop = async (phase: string) => {
    const electron = createRequire(import.meta.url)("electron") as string;
    desktop = spawn(electron, [join(root, "scripts/testing/report-desktop.mjs"), configPath, phase], {
      env: { PATH: process.env.PATH, HOME: join(desktopHome, "home"), USERPROFILE: join(desktopHome, "home"),
        XDG_CONFIG_HOME: join(desktopHome, "home"), TMPDIR: desktopHome, TEMP: desktopHome, TMP: desktopHome,
        DISPLAY: process.env.DISPLAY, SystemRoot: process.env.SystemRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [desktop.stdout!, desktop.stderr!]) stream.on("data", data => appendFileSync(join(output, `electron-${phase}.log`), data));
    const timer = setTimeout(() => desktop?.kill("SIGTERM"), 120_000);
    const code = await new Promise((resolve, reject) => { desktop!.once("error", reject); desktop!.once("close", resolve); }).finally(() => clearTimeout(timer));
    desktop = undefined;
    assert.equal(code, 0, `Electron ${phase} failed; inspect ${output}`);
    receipt[phase] = JSON.parse(readFileSync(join(output, `${phase}.json`), "utf8"));
    persist();
  };
  console.log(JSON.stringify({ phase: "native-browser-read", evidence: output, sources: sources.length }));
  await runDesktop("initial");
  const beforeRestart = await api("GET", `/api/threads/${bot.threadId}/messages?limit=100`);
  await waitForExit(fixture.child, { signal: "SIGTERM" });
  const log = openSync(fixture.info.logPath, "a", 0o600);
  restarted = spawn(process.execPath, ["--experimental-strip-types", join(root, "server/index.ts")], {
    cwd: root, env: { ...verificationServerEnvironment({}, fixture.info.dataDir, Number(new URL(fixture.info.url).port)),
      OMB_AGENT_BROWSER_PATH: binaryPath, AGENT_BROWSER_EXECUTABLE_PATH: executablePath }, stdio: ["ignore", log, log],
  });
  closeSync(log);
  await until(async () => {
    try { return (await api("GET", "/api/health")).pid === restarted!.pid; } catch { return false; }
  }, "restarted owned server identity");
  const afterRestart = await api("GET", `/api/threads/${bot.threadId}/messages?limit=100`);
  assert.deepEqual(afterRestart.messages.map((item: { id: string }) => item.id), beforeRestart.messages.map((item: { id: string }) => item.id));
  assert.equal(createHash("sha256").update(readFileSync(reportPath)).digest("hex"), reportHash);
  await runDesktop("restored");
  receipt.persistence = { sameMessageIds: true, sameReportHash: true, ownedServerPidChanged: fixture.child.pid !== restarted.pid };
  receipt.passed = true;
} catch (error) {
  receipt.passed = false;
  receipt.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await waitForExit(desktop, { signal: "SIGTERM" });
  await waitForExit(restarted, { signal: "SIGTERM" });
  await runtime.closeAll();
  const nativeBrowserStopped = await closeBrowserSession(binaryPath, browserEnv);
  if (nativeBrowserStopped) rmSync(browserEnv.AGENT_BROWSER_SOCKET_DIR!, { recursive: true, force: true });
  await ui?.close();
  await fixture.close();
  rmSync(desktopHome, { recursive: true, force: true });
  receipt.endedAt = new Date().toISOString();
  receipt.cleanup = { isolatedServerStopped: true, isolatedDesktopStopped: true, nativeBrowserStopped, temporaryHomesRemoved: true };
  if (!nativeBrowserStopped) receipt.passed = false;
  persist();
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  console.log(JSON.stringify({ phase: "complete", passed: receipt.passed, receipt: join(output, "receipt.json") }));
  assert(nativeBrowserStopped, "Owned native browser did not confirm shutdown");
}
