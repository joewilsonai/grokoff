// GrokOff: Stop retains an honest unfinished-tool receipt across server restart.
// Real owned HTTP/server/Claude adapter; scripted CLI only, no native browser or account.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import type { InspectorPage } from "../shared/inspector.ts";
import type { WireBot, WireMessage } from "../shared/wire.ts";
import { launchVerificationServer, verificationServerEnvironment } from "../scripts/control-omb.ts";
import { waitForExit } from "./testing/cleanup.ts";
import { handleToolCall } from "../scripts/mcp-server.ts";

type BotSnapshot = WireBot & { messages: WireMessage[] };
const root = fileURLToPath(new URL("..", import.meta.url));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

it.skipIf(process.platform === "win32")("settles a stopped browser tool as interrupted, preserves actual outcomes, and reloads the same receipt", async () => {
  const fixture = await launchVerificationServer({ FAKE_CLAUDE_MODE: "hang" });
  let restarted: ChildProcess | undefined;
  let providerPid: number | undefined;
  const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json", origin: fixture.info.url },
      signal: AbortSignal.timeout(10_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
    return await response.json() as T;
  };
  try {
    const pidFile = join(fixture.info.dataDir, "owned-provider.pid");
    const wrapper = join(fixture.info.dataDir, "pending-tool-claude.mjs");
    const frames = [
      { type: "assistant", message: { content: [{ type: "tool_use", id: "finished", name: "Read", input: { file: "synthetic.md" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "finished", is_error: false, content: "Recorded synthetic result" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "failed", name: "Read", input: { file: "missing.md" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "failed", is_error: true, content: "Recorded synthetic refusal" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "pending", name: "mcp__browser__get_text", input: { selector: "main" } }] } },
    ];
    writeFileSync(wrapper, [
      "#!/usr/bin/env node", "import { writeFileSync } from 'node:fs';",
      "process.env.FAKE_CLAUDE_MODE = 'hang';", "const original = process.stdout.write.bind(process.stdout); let injected = false;",
      `const frames = ${JSON.stringify(frames)};`,
      `process.stdout.write = (chunk, ...rest) => { const result = original(chunk, ...rest); try { const event = JSON.parse(String(chunk)); if (event.type === 'system' && event.subtype === 'init' && !injected) { injected = true; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); for (const frame of frames) original(JSON.stringify(frame) + '\\n'); } } catch {} return result; };`,
      `await import(${JSON.stringify(pathToFileURL(join(root, "server/testing/fake-claude-cli.ts")).href)});`,
    ].join("\n"), { mode: 0o700 });
    await api("PATCH", "/api/instances/claude", { cli: wrapper });
    await api("PATCH", "/api/config", { features: { showToolCalls: true, llmThreadTitles: false, autoRecall: false } });
    const bot = (await api<{ bots: BotSnapshot[] }>("GET", "/api/bots?messages=200")).bots[0]!;
    const snapshot = async () => (await api<{ bots: BotSnapshot[] }>("GET", "/api/bots?messages=200")).bots.find(item => item.id === bot.id)!;
    await api("POST", `/api/bots/${bot.id}/messages`, { threadId: bot.threadId, text: "Use only the synthetic research tool." });
    await expect.poll(async () => (await snapshot()).messages.some(message => message.tool?.itemId === "pending"), { timeout: 10_000 }).toBe(true);
    const before = await snapshot();
    expect(before.busy).toBe(true);
    providerPid = Number(readFileSync(pidFile, "utf8"));
    expect(alive(providerPid)).toBe(true);
    const finished = before.messages.filter(message => message.tool?.ok !== undefined);
    await api("POST", `/api/bots/${bot.id}/interrupt`, { threadId: bot.threadId });
    await expect.poll(async () => !(await snapshot()).busy && !alive(providerPid!), { timeout: 10_000 }).toBe(true);
    const after = await snapshot();
    const interrupted = after.messages.find(message => message.tool?.itemId === "pending")!;
    expect(after.activity).toBe("idle");
    expect(interrupted.tool).toMatchObject({ name: "mcp__browser__get_text", interrupted: true });
    expect(interrupted.tool).not.toHaveProperty("ok");
    expect(interrupted.tool).not.toHaveProperty("output");
    expect(after.messages.filter(message => message.tool?.ok !== undefined)).toEqual(finished);
    expect(finished.some(message => message.tool?.ok === true && message.tool.output?.includes("Recorded synthetic result"))).toBe(true);
    expect(finished.some(message => message.tool?.ok === false && message.tool.output?.includes("Recorded synthetic refusal"))).toBe(true);

    // Exercise the production MCP projection over the same owned HTTP receipt.
    // This transport cannot discover or address the user's running server.
    const projected = async (name: "get_bot_messages" | "wait_for_conversation") => {
      const args = name === "get_bot_messages" ? { bot_id: bot.id, task_id: bot.threadId, limit: 200 }
        : { target_type: "bot", target_id: bot.id, task_id: bot.threadId };
      return JSON.parse(JSON.stringify(await handleToolCall(name, args, async (path, options) => {
        expect(options?.method ?? "GET").toBe("GET");
        expect(path.startsWith("/api/")).toBe(true);
        return api("GET", path);
      }))) as { messages: WireMessage[]; status?: string };
    };
    for (const name of ["get_bot_messages", "wait_for_conversation"] as const) {
      const result = await projected(name);
      const tool = result.messages.find(message => message.id === interrupted.id)?.tool;
      expect(tool).toMatchObject({ name: "mcp__browser__get_text", interrupted: true });
      expect(tool).not.toHaveProperty("ok"); expect(tool).not.toHaveProperty("output");
      expect(tool).not.toHaveProperty("input");
      if (name === "wait_for_conversation") expect(result.status).toBe("settled");
    }

    await waitForExit(fixture.child, { signal: "SIGTERM" });
    expect(alive(fixture.info.pid)).toBe(false);
    const port = Number(new URL(fixture.info.url).port);
    restarted = spawn(process.execPath, ["--experimental-strip-types", join(root, "server/index.ts")], {
      cwd: root, env: verificationServerEnvironment({ FAKE_CLAUDE_MODE: "hang" }, fixture.info.dataDir, port), stdio: "ignore",
    });
    await expect.poll(async () => {
      try { return (await fetch(`${fixture.info.url}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; }
      catch { return false; }
    }, { timeout: 15_000 }).toBe(true);
    const restored = await snapshot();
    expect(restored.messages.find(message => message.id === interrupted.id)).toEqual(interrupted);
    expect(restored.messages.filter(message => message.tool?.ok !== undefined)).toEqual(finished);
    expect(restored.busy).toBe(false);
  } finally {
    await waitForExit(restarted, { signal: "SIGTERM" });
    await fixture.close();
    expect(alive(fixture.info.pid)).toBe(false);
    if (restarted?.pid) expect(alive(restarted.pid)).toBe(false);
    if (providerPid) expect(alive(providerPid)).toBe(false);
    expect(existsSync(fixture.info.dataDir)).toBe(false);
  }
}, 45_000);

it.skipIf(process.platform === "win32").each(["cancel", "exit"] as const)("preserves ACP completion and unfinished-tool outcomes after %s", async action => {
  const fixture = await launchVerificationServer();
  let server: ChildProcess | undefined;
  let providerPid: number | undefined;
  const pidFile = join(fixture.info.dataDir, "owned-acp-provider.pid");
  const exitGate = join(fixture.info.dataDir, "owned-acp-exit-gate");
  const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method, headers: { "content-type": "application/json", origin: fixture.info.url },
      signal: AbortSignal.timeout(10_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
    return await response.json() as T;
  };
  try {
    // Configure only the launcher's stopped disposable server. The production
    // ACP adapter/catalog runs against this repository-owned scripted CLI.
    await waitForExit(fixture.child, { signal: "SIGTERM" });
    const wrapper = join(fixture.info.dataDir, "pending-tool-acp.mjs");
    const updates = [
      { sessionUpdate: "tool_call", toolCallId: "acp-complete", title: "Read", rawInput: { file: "synthetic.md" } },
      { sessionUpdate: "tool_call_update", toolCallId: "acp-complete", status: "completed", rawOutput: { text: "Recorded ACP result" } },
      { sessionUpdate: "tool_call", toolCallId: "acp-failed", title: "Read", rawInput: { file: "missing.md" } },
      { sessionUpdate: "tool_call_update", toolCallId: "acp-failed", status: "failed", rawOutput: { text: "Recorded ACP refusal" } },
      { sessionUpdate: "tool_call", toolCallId: "acp-pending", title: "mcp__browser__get_text", rawInput: { selector: "main" } },
    ];
    writeFileSync(wrapper, [
      "#!/usr/bin/env node", "import { existsSync, writeFileSync } from 'node:fs';",
      "process.env.FAKE_ACP_MODE = 'stall-after-text'; process.env.FAKE_ACP_MODELS = 'fixture/research';",
      "const original = process.stdout.write.bind(process.stdout); let injected = false;",
      `const updates = ${JSON.stringify(updates)};`,
      `process.stdout.write = (chunk, ...rest) => { const result = original(chunk, ...rest); try { const frame = JSON.parse(String(chunk)); if (frame.method === 'session/update' && frame.params?.update?.sessionUpdate === 'agent_message_chunk' && !injected) { injected = true; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); for (const update of updates) original(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{update}}) + '\\n'); if (${JSON.stringify(action === 'exit')}) setInterval(() => { if (existsSync(${JSON.stringify(exitGate)})) process.exit(0); }, 10); } } catch {} return result; };`,
      `await import(${JSON.stringify(pathToFileURL(join(root, "server/testing/fake-acp-cli.ts")).href)});`,
    ].join("\n"), { mode: 0o700 });
    const configPath = join(fixture.info.dataDir, "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as { instances: Record<string, unknown>; features?: Record<string, unknown> };
    config.instances.opencodeGo = { driver: "opencodeGo", displayName: "Owned ACP fixture", config: { cli: wrapper } };
    config.features = { ...config.features, showToolCalls: true, llmThreadTitles: false, autoRecall: false };
    writeFileSync(configPath, JSON.stringify(config));
    const descriptor = openSync(fixture.info.logPath, "a", 0o600);
    try {
      server = spawn(process.execPath, ["--experimental-strip-types", join(root, "server/index.ts")], {
        cwd: root, env: verificationServerEnvironment({}, fixture.info.dataDir, Number(new URL(fixture.info.url).port)), stdio: ["ignore", descriptor, descriptor],
      });
    } finally { closeSync(descriptor); }
    await expect.poll(async () => {
      try { return (await fetch(`${fixture.info.url}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; }
      catch { return false; }
    }, { timeout: 15_000 }).toBe(true);
    const bot = (await api<{ bots: BotSnapshot[] }>("GET", "/api/bots?messages=200")).bots[0]!;
    await api("PATCH", `/api/bots/${bot.id}/tasks/${bot.threadId}`, { modelSelection: { instanceId: "opencodeGo", model: "fixture/research" } });
    const snapshot = async () => (await api<{ bots: BotSnapshot[] }>("GET", "/api/bots?messages=200")).bots.find(item => item.id === bot.id)!;
    await api("POST", `/api/bots/${bot.id}/messages`, { threadId: bot.threadId, text: "Use only the synthetic ACP research tool." });
    await expect.poll(async () => (await snapshot()).messages.some(message => message.tool?.itemId === "acp-pending"), { timeout: 10_000 }).toBe(true);
    providerPid = Number(readFileSync(pidFile, "utf8"));
    expect(alive(providerPid)).toBe(true);
    const before = await snapshot();
    const finished = before.messages.filter(message => message.tool?.ok !== undefined);
    expect(before.busy).toBe(true);
    if (action === "cancel") await api("POST", `/api/bots/${bot.id}/interrupt`, { threadId: bot.threadId });
    else writeFileSync(exitGate, "exit only the owned synthetic ACP process");
    await expect.poll(async () => !(await snapshot()).busy, { timeout: 10_000 }).toBe(true);
    const events = await api<InspectorPage>("GET", `/api/threads/${bot.threadId}/events?limit=200`);
    const completion = events.entries.findLast(entry => entry.kind === "runtime" && entry.data.type === "turn.completed");
    expect(completion?.data).toMatchObject({ type: "turn.completed", stopReason: action === "cancel" ? "cancelled" : "exit_before_result", ok: action === "cancel" });
    const after = await snapshot();
    const interrupted = after.messages.find(message => message.tool?.itemId === "acp-pending")!;
    expect(interrupted.turnId).toBe(completion?.kind === "runtime" ? completion.data.turnId : undefined);
    if (action === "cancel") expect(interrupted.tool).toMatchObject({ interrupted: true });
    else expect(interrupted.tool).not.toHaveProperty("interrupted");
    expect(interrupted.tool).not.toHaveProperty("ok");
    expect(interrupted.tool).not.toHaveProperty("output");
    expect(after.messages.filter(message => finished.some(row => row.id === message.id))).toEqual(finished);
    expect(finished.some(message => message.tool?.ok === true && message.tool.output?.includes("Recorded ACP result"))).toBe(true);
    expect(finished.some(message => message.tool?.ok === false && message.tool.output?.includes("Recorded ACP refusal"))).toBe(true);
  } finally {
    await waitForExit(server, { signal: "SIGTERM" });
    if (!providerPid && existsSync(pidFile)) providerPid = Number(readFileSync(pidFile, "utf8"));
    if (providerPid) await expect.poll(() => alive(providerPid!), { timeout: 5_000 }).toBe(false);
    await fixture.close();
    expect(alive(fixture.info.pid)).toBe(false);
    if (server?.pid) expect(alive(server.pid)).toBe(false);
    expect(existsSync(fixture.info.dataDir)).toBe(false);
  }
}, 45_000);
