// GrokOff: Stop must reach browser work already accepted by the harness.
// Real HTTP/provider lifecycle, synthetic CLI and browser, disposable home.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { launchVerificationServer, type VerificationServer } from "../scripts/control-omb.ts";
import { removeTempDir } from "./testing/cleanup.ts";

describe.skipIf(process.platform === "win32")("browser Stop through the server", () => {
  let fixture: VerificationServer | undefined;
  let scratch: string | undefined;
  const api = async (method: string, path: string, body?: unknown, token?: string) => {
    const response = await fetch(`${fixture!.info.url}${path}`, {
      method, headers: { "content-type": "application/json", origin: fixture!.info.url,
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };

  afterEach(async () => {
    await fixture?.close();
    if (scratch) await removeTempDir(scratch);
  });

  it("retires the stopped capability, closes only its browser, and fences a replacement until recovery", async () => {
    scratch = mkdtempSync(join(tmpdir(), "grokoff-browser-stop-api-"));
    const browser = join(scratch, "agent-browser");
    writeFileSync(browser, [
      "#!/usr/bin/env node",
      'import { writeFileSync } from "node:fs";',
      'import { createInterface } from "node:readline";',
      `const dir = ${JSON.stringify(scratch)};`,
      'const args = process.argv.slice(2);',
      'const session = process.env.AGENT_BROWSER_SESSION;',
      'if (args[0] === "mcp") {',
      '  createInterface({ input: process.stdin }).on("line", line => {',
      '    const message = JSON.parse(line); if (message.id === undefined) return;',
      '    if (message.method === "tools/call" && message.params.name === "delayed-action") {',
      '      writeFileSync(dir + "/accepted", session); return;',
      '    }',
      '    const result = message.method === "initialize" ? { protocolVersion: "2025-06-18", capabilities: { tools: {} } }',
      '      : message.method === "tools/list" ? { tools: [{ name: "delayed-action", inputSchema: { type: "object" } }] }',
      '      : { content: [{ type: "text", text: "synthetic browser response" }] };',
      '    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\\n");',
      '  });',
      '} else if (args[0] === "close") writeFileSync(dir + "/closed", session);',
      'else if (args[0] === "session") process.stdout.write(JSON.stringify({ success: true, data: { sessions: [] } }));',
      'else process.stdout.write("1.0.0\\n");',
    ].join("\n"), { mode: 0o700 });
    fixture = await launchVerificationServer({ FAKE_CLAUDE_MODE: "hang" }, undefined, undefined,
      { binaryPath: browser, executablePath: browser });
    expect((await api("PATCH", "/api/config", { features: { browser: true } })).status).toBe(200);
    const created = await api("POST", "/api/bots", { name: "Browser Stop fixture", browser: true, computer: "browser",
      modelSelection: { instanceId: "claude", model: "claude-sonnet-5" } });
    expect(created.status).toBe(201);
    const { id: botId, threadId } = created.body.bot;
    const begin = async () => {
      rmSync(fixture!.fixtureDumpPath, { force: true });
      expect((await api("POST", `/api/bots/${botId}/messages`, { text: "Use the fixture browser.", threadId })).status).toBe(202);
      await expect.poll(() => existsSync(fixture!.fixtureDumpPath), { timeout: 10_000 }).toBe(true);
      return JSON.parse(readFileSync(fixture!.fixtureDumpPath, "utf8")).mcpConfig.mcpServers.browser.env.OMB_MCP_TOKEN as string;
    };
    const call = (token: string, name: string) => api("POST", "/api/internal/browser/mcp",
      { method: "tools/call", params: { name, arguments: {} } }, token);
    const stoppedToken = await begin();
    rmSync(join(scratch, "closed"), { force: true });
    const accepted = call(stoppedToken, "delayed-action");
    await expect.poll(() => existsSync(join(scratch!, "accepted")), { timeout: 10_000 }).toBe(true);
    expect((await api("POST", `/api/bots/${botId}/interrupt`, { threadId })).status).toBe(200);
    const cancelled = await accepted;
    expect(cancelled.status).toBeGreaterThanOrEqual(400);
    expect(cancelled.body.error).toMatch(/stopped|revoked|inactive/i);
    await expect.poll(() => existsSync(join(scratch!, "closed")), { timeout: 10_000 }).toBe(true);
    expect(readFileSync(join(scratch, "closed"), "utf8")).toBe(readFileSync(join(scratch, "accepted"), "utf8"));
    expect((await call(stoppedToken, "echo")).status).toBe(401);

    const nextToken = await begin();
    expect(nextToken).not.toBe(stoppedToken);
    const fenced = await call(nextToken, "echo");
    expect(fenced.status).toBeGreaterThanOrEqual(400);
    expect(fenced.body.error).toMatch(/Restart/);
    expect((await call(nextToken, "restart_browser")).status).toBe(200);
    expect((await call(nextToken, "echo")).status).toBe(200);
    expect((await api("POST", `/api/bots/${botId}/interrupt`, { threadId })).status).toBe(200);
  }, 30_000);
});
