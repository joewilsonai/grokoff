// Opt in with GROKOFF_NATIVE_BROWSER_TEST_BIN pointing at the staged or
// packaged pinned engine. No download, user state, browser UI, or navigation.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { agentBrowserIntegration, closeBrowserSession, prepareBrowserSessionState } from "./browser-engine.ts";
import { BrowserRuntime } from "./browser-runtime.ts";

const binary = process.env.GROKOFF_NATIVE_BROWSER_TEST_BIN;
describe.skipIf(!binary || !existsSync(binary))("bundled browser namespace lifecycle", () => {
  it("prepares and connects a UUID bot in a long home through private short sockets", async () => {
    const home = mkdtempSync("/tmp/grokoff-browser-native-long-home-");
    const session = "bot-7dfc2147-e601-4a19-8b5c-4e718cd99733";
    const upstream = join(home, ".agent-browser", "sessions");
    mkdirSync(upstream, { recursive: true, mode: 0o700 });
    const previous = join(upstream, `${session}-${session}.json.enc`);
    writeFileSync(previous, "unrelated upstream fixture state", { mode: 0o600 });
    const integration = agentBrowserIntegration({ binaryPath: binary!, session, encryptionKey: "1".repeat(64), env: { HOME: home, USERPROFILE: home, PATH: "/usr/bin:/bin" } });
    const runtime = new BrowserRuntime({ requestTimeoutMs: 5_000 });
    try {
      expect(Buffer.byteLength(join(home, ".agent-browser", "namespaces", "grokoff", "run", `${session}.sock`))).toBeGreaterThan(103);
      expect(Buffer.byteLength(join(integration.env.AGENT_BROWSER_SOCKET_DIR, "namespaces", "grokoff", "run", `${session}.sock`))).toBeLessThanOrEqual(103);
      await expect(prepareBrowserSessionState(integration.command, session, { env: integration.env, timeoutMs: 5_000 })).resolves.toBeUndefined();
      const tools = await runtime.agentRpc(session, integration, "tools/list", {}) as { tools: Array<{ name: string }> };
      expect(tools.tools.some((tool) => tool.name === "agent_browser_snapshot")).toBe(true);
      expect(readFileSync(previous, "utf8")).toBe("unrelated upstream fixture state");
    } finally {
      await runtime.closeAll();
      const closed = await closeBrowserSession(integration.command, integration.env, 5_000);
      // Never delete a directory from under an uncertain daemon.
      if (closed) {
        rmSync(home, { recursive: true, force: true });
        rmSync(integration.env.AGENT_BROWSER_SOCKET_DIR, { recursive: true, force: true });
      }
      expect(closed).toBe(true);
    }
  }, 15_000);
});
