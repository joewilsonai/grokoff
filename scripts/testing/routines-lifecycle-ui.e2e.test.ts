// GrokOff-owned acceptance: real renderer, disposable server and fake engine.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { closeBrowserSession } from "../../server/browser-engine.ts";
import { browserCommandEnv } from "../../server/browser-runtime.ts";
import { launchVerificationServer } from "../control-omb.ts";
import { agentBrowser, sessionEnv } from "./control-omb-ui.ts";
import { mountPreview, type MountedPreview } from "./preview-fixture.ts";

const enabled = process.env.OMB_UI_E2E === "1";
const NAME = "Renderer lifecycle fixture";
const PROMPT = "Reply with the fake fixture response. Use no external services.";

(enabled ? it : it.skip)("creates, edits, pauses, runs and reloads one routine through the renderer", async () => {
  // Explicit installed binaries keep this acceptance offline and away from
  // personal browsers. Missing paths fail rather than installing or discovering.
  const binary = process.env.OMB_AGENT_BROWSER_PATH;
  const chrome = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
  if (!binary || !chrome || !existsSync(binary) || !existsSync(chrome)) {
    throw new Error("Set OMB_AGENT_BROWSER_PATH and AGENT_BROWSER_EXECUTABLE_PATH to the reviewed installed browser binaries.");
  }
  const evidenceDir = process.env.OMB_ROUTINES_UI_EVIDENCE_DIR
    ? resolve(process.env.OMB_ROUTINES_UI_EVIDENCE_DIR) : join(tmpdir(), "openmausbot-verification-evidence");
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  const fixture = await launchVerificationServer({}, undefined, undefined, { binaryPath: binary, executablePath: chrome });
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json", origin: fixture.info.url },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    expect(response.ok, `${method} ${path}: ${JSON.stringify(result)}`).toBe(true);
    return result;
  };
  const evidenceName = `routines-ui-${Date.now()}-${fixture.info.pid}`;
  const receiptPath = join(evidenceDir, `${evidenceName}.json`);
  const configPath = join(fixture.info.dataDir, "browser-empty-config.json");
  const env = browserCommandEnv({
    ...sessionEnv({ home: fixture.info.dataDir, session: "workflow", chrome }, { PATH: dirname(process.execPath) }),
    APPDATA: join(fixture.info.dataDir, "AppData", "Roaming"),
    LOCALAPPDATA: join(fixture.info.dataDir, "AppData", "Local"),
    XDG_CONFIG_HOME: join(fixture.info.dataDir, ".config"),
    XDG_CACHE_HOME: join(fixture.info.dataDir, ".cache"),
    XDG_DATA_HOME: join(fixture.info.dataDir, ".local", "share"),
    XDG_RUNTIME_DIR: join(fixture.info.dataDir, ".runtime"),
    AGENT_BROWSER_NAMESPACE: "routine-ui",
    AGENT_BROWSER_SOCKET_DIR: join(fixture.info.dataDir, "sockets"),
    AGENT_BROWSER_CONFIG: configPath,
  });
  const evidence: Record<string, unknown> = { fixture: fixture.info, binary, chrome, session: env.AGENT_BROWSER_SESSION, namespace: env.AGENT_BROWSER_NAMESPACE, socketDir: env.AGENT_BROWSER_SOCKET_DIR, actions: [] };
  const actions = evidence.actions as string[];
  const browser = (args: string[]) => agentBrowser(binary, env, args);
  const evaluate = async (js: string) => (await browser(["eval", js])).result;
  const click = async (name: string) => {
    let target = "";
    await expect.poll(async () => {
      const snapshot = await browser(["snapshot", "-i"]);
      const refs = snapshot.refs as Record<string, { name: string; role: string }>;
      const matches = Object.entries(refs).filter(([, ref]) => ref.name === name && ref.role === "button");
      if (matches.length !== 1) return false;
      target = `@${matches[0][0]}`;
      return true;
    }, { timeout: 10_000 }).toBe(true);
    await browser(["click", target]);
    actions.push(`click ${name}`);
  };
  // Native select popups are unreliable in headless Chrome; dispatch normal
  // input/change events on the actual renderer controls, as the cron recipe does.
  const fill = (selector: string, value: string) => evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) throw new Error('Fixture input missing: ' + ${JSON.stringify(selector)});
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true })); return field.value;
  })()`);
  const select = (label: string, value: string) => evaluate(`(() => {
    const field = document.querySelector('select[aria-label=${JSON.stringify(label)}]');
    field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('change', { bubbles: true })); return field.value;
  })()`);
  const snapshot = () => api("GET", "/api/routines");
  const drawer = () => evaluate('document.querySelector(\'aside[aria-label="Routine details"]\')?.innerText ?? ""');
  const openRoutine = async () => {
    await click("Routines"); await click("List");
    await expect.poll(() => evaluate(`(() => {
      const row = document.querySelector('article[aria-label=${JSON.stringify(NAME)}]');
      const button = row?.querySelector('button'); if (!button) return false;
      return !button.disabled;
    })()`), { timeout: 10_000 }).toBe(true);
    await browser(["click", `article[aria-label="${NAME}"] button`]);
  };
  let preview: MountedPreview | undefined;
  let opened = false;
  let browserClosed = false;
  let daemonPid: number | undefined;
  let daemonExited = false;
  let failure: unknown;
  const cleanupErrors: unknown[] = [];
  const pidExists = (pid: number) => {
    try { process.kill(pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
  };
  try {
    writeFileSync(configPath, "{}\n", { mode: 0o600 });
    const health = await api("GET", "/api/health");
    expect(health.pid).toBe(fixture.child.pid);
    expect(new URL(fixture.info.url).hostname).toBe("127.0.0.1");
    await api("PUT", "/api/config", { language: "en", profile: { name: "Routine workflow fixture" } });
    const { bots } = await api("GET", "/api/bots");
    expect(bots).toHaveLength(1);
    await api("PATCH", `/api/bots/${bots[0].id}/profile`, { name: "Pepper" });
    preview = await mountPreview(fixture, { entry: "/scripts/testing/threads-preview.tsx", route: "/__routines-lifecycle.html", title: "Isolated GrokOff routine workflow", logLevel: "warn" });
    evidence.previewUrl = preview.previewUrl;
    opened = true;
    await browser(["open", preview.previewUrl]);
    const rawPid = readFileSync(join(env.AGENT_BROWSER_SOCKET_DIR!, "namespaces", env.AGENT_BROWSER_NAMESPACE!, "run", "workflow.pid"), "utf8").trim();
    expect(rawPid).toMatch(/^[1-9][0-9]*$/);
    daemonPid = Number(rawPid);
    evidence.daemonPid = daemonPid;
    await browser(["set", "viewport", "1280", "900"]);
    await click("Routines");
    await click("New routine");
    await fill('input[placeholder="Add title"]', NAME);
    await fill('textarea[placeholder="What should the bot do?"]', PROMPT);
    await click("More options");
    expect(await evaluate('document.querySelector(\'input[placeholder="Add title"]\').value')).toBe(NAME);
    expect(await evaluate('document.querySelector(\'textarea[placeholder="Add instructions for the bot"]\').value')).toBe(PROMPT);
    await select("Repeat", "interval");
    await select("How often this routine runs", "60");
    await click("Schedule routine");
    await expect.poll(async () => (await snapshot()).routines.length).toBe(1);
    await expect.poll(() => evaluate('document.querySelector("[role=dialog]") === null')).toBe(true);
    const saved = (await snapshot()).routines[0];
    expect(saved).toMatchObject({ name: NAME, prompt: PROMPT, botId: bots[0].id, enabled: true, schedule: { type: "interval", everyMinutes: 60 } });
    expect(saved.nextRunAt).toBeGreaterThan(Date.now() + 3_000_000);
    await click("List");
    await expect.poll(() => evaluate(`!!document.querySelector('article[aria-label=${JSON.stringify(NAME)}] button')`)).toBe(true);
    await browser(["click", `article[aria-label="${NAME}"] button`]);
    await click("Pause");
    await expect.poll(async () => (await snapshot()).routines[0].enabled).toBe(false);
    await click("Resume");
    await expect.poll(async () => (await snapshot()).routines[0].enabled).toBe(true);
    await click("Edit");
    await fill('textarea[placeholder="Add instructions for the bot"]', `${PROMPT} Preserve the saved interval.`);
    await click("Save");
    await expect.poll(() => evaluate('document.querySelector("[role=dialog]") === null')).toBe(true);
    const edited = (await snapshot()).routines[0];
    expect(edited.id).toBe(saved.id);
    expect(edited.schedule).toEqual(saved.schedule);
    expect(edited.nextRunAt).toBe(saved.nextRunAt);
    await browser(["click", `article[aria-label="${NAME}"] button`]);
    await expect.poll(() => drawer()).toContain("Preserve the saved interval.");
    await click("Run now");
    await expect.poll(() => drawer(), { timeout: 30_000 }).toContain("Completed");
    expect(await drawer()).toContain("hello from fake claude");
    const terminal = await snapshot();
    expect(terminal.routines).toHaveLength(1);
    expect(terminal.runs).toHaveLength(1);
    const run = terminal.runs[0];
    expect(run).toMatchObject({ routineId: saved.id, status: "completed", triggerSource: "manual", resultsThreadId: bots[0].threadId });
    const executionThreadId = run.executionThreadId ?? run.threadId;
    expect(executionThreadId).toEqual(expect.any(String));
    expect(executionThreadId).not.toBe(run.resultsThreadId);
    const results = await api("GET", `/api/threads/${run.resultsThreadId}/messages?limit=100`);
    const receipts = results.messages.filter((message: any) => message.routineRun?.runId === run.id);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].routineRun).toMatchObject({ status: "completed", executionThreadId, summary: "hello from fake claude" });
    await click("Open results thread");
    await expect.poll(() => evaluate(`document.querySelector('section[aria-label=${JSON.stringify(`${NAME} routine run: Completed`)}]')?.innerText ?? ''`)).toContain("Completed");
    await click(`Open run for ${NAME}`);
    await expect.poll(async () => (await api("GET", "/api/bots")).bots[0].threadId).toBe(executionThreadId);
    await expect.poll(() => evaluate("document.body.innerText")).toContain("Back to results");
    expect(await evaluate("document.body.innerText")).toContain("hello from fake claude");
    await click("Back to results");
    await expect.poll(async () => (await api("GET", "/api/bots")).bots[0].threadId).toBe(run.resultsThreadId);
    await browser(["screenshot", join(evidenceDir, `${evidenceName}-receipt.png`)]);
    await browser(["reload"]);
    await expect.poll(() => evaluate(`document.querySelector('section[aria-label=${JSON.stringify(`${NAME} routine run: Completed`)}]')?.innerText ?? ''`), { timeout: 15_000 }).toContain("Completed");
    evidence.reloadedReceipt = await evaluate(`document.querySelector('section[aria-label=${JSON.stringify(`${NAME} routine run: Completed`)}]').innerText`);
    await openRoutine();
    expect(await drawer()).toContain("Preserve the saved interval.");
    evidence.reloadedDrawer = await drawer();
    const reloaded = await snapshot();
    expect(reloaded.routines).toHaveLength(1);
    expect(reloaded.runs).toHaveLength(1);
    expect(reloaded.routines[0]).toMatchObject({ id: saved.id, schedule: saved.schedule, enabled: true });
    expect(reloaded.runs[0]).toMatchObject({ id: run.id, threadId: executionThreadId, status: "completed" });
    const persisted = JSON.parse(readFileSync(join(fixture.info.dataDir, "routines.json"), "utf8"));
    expect(persisted.routines).toHaveLength(1);
    expect(persisted.runs).toHaveLength(1);
    expect(persisted.routines[0]).toMatchObject({ id: saved.id, name: NAME, prompt: edited.prompt, enabled: true, schedule: saved.schedule, nextRunAt: reloaded.routines[0].nextRunAt });
    expect(persisted.runs[0]).toMatchObject({ id: run.id, routineId: saved.id, prompt: edited.prompt, status: "completed", threadId: executionThreadId, resultsThreadId: run.resultsThreadId, output: "hello from fake claude" });
    const console = await browser(["console"]);
    expect((console.messages as Array<{ type: string }>).filter(message => message.type === "error")).toEqual([]);
    evidence.final = reloaded;
    evidence.persisted = persisted;
    evidence.console = console;
  } catch (error) {
    failure = error;
    evidence.error = String(error);
    evidence.observed = await snapshot().catch(() => null);
    if (opened) evidence.lastSnapshot = await browser(["snapshot"]).catch(() => null);
  } finally {
    try {
      if (opened) browserClosed = await closeBrowserSession(binary, env);
    } catch (error) { cleanupErrors.push(error); }
    try {
      if (daemonPid) {
        await expect.poll(() => pidExists(daemonPid!), { timeout: 5_000 }).toBe(false);
        daemonExited = true;
      }
    } catch (error) { cleanupErrors.push(error); }
    try { await preview?.close(); }
    catch (error) { cleanupErrors.push(error); }
    try { await fixture.close(); }
    catch (error) { cleanupErrors.push(error); }
    const cleanup = { browserClosed, daemonExited, serverExited: fixture.child.exitCode !== null || fixture.child.signalCode !== null, dataRemoved: !existsSync(fixture.info.dataDir) };
    evidence.cleanup = cleanup;
    if (!Object.values(cleanup).every(Boolean)) cleanupErrors.push(new Error("Owned fixture cleanup did not complete."));
    evidence.cleanupErrors = cleanupErrors.map(String);
    evidence.passed = !failure && cleanupErrors.length === 0;
    // Keep diagnostics even if cleanup fails; the first workflow failure
    // remains the error reported by the test instead of being overwritten.
    try {
      writeFileSync(receiptPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      console.log(`Routine UI evidence: ${receiptPath}`);
    } catch (error) { failure ??= error; }
  }
  if (failure) throw failure;
  expect(cleanupErrors.map(String)).toEqual([]);
}, 180_000);
