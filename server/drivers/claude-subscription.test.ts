import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderInstance } from "../contracts.ts";
import { removeTempDir } from "../testing/cleanup.ts";
import { recordEvents } from "../testing/events.ts";
import { CLAUDE_ACCOUNT_ENV_KEYS, ClaudeDriver } from "./claude.ts";
import { claudeStatusBilling } from "./claude-subscription-policy.ts";

// Only this disposable CLI runs. It records launches, never reads a real
// credential store, opens Keychain, contacts a provider, or does inference.
const FAKE = `#!/usr/bin/env node
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ args, env: Object.fromEntries(${JSON.stringify(CLAUDE_ACCOUNT_ENV_KEYS)}.map(key => [key, process.env[key]])) }) + "\\n");
if (args[0] === "--version") { console.log("2.1.295"); process.exit(0); }
if (args[0] === "--help") { console.log("Usage: claude"); process.exit(0); }
if (args[0] === "auth" && args[1] === "status") {
 console.log(existsSync(process.env.FIXTURE_CALLS + ".authenticated") ? JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }) : process.env.FIXTURE_AUTH); process.exit(0);
}
if (args[0] === "auth" && args[1] === "login") {
 console.log("Visit https://claude.com/cai/oauth/authorize?code=true&state=fixture");
 process.stdin.once("data", () => { writeFileSync(process.env.FIXTURE_CALLS + ".authenticated", "fixture only"); process.exit(0); });
} else
if (args.includes("text")) { process.stdin.resume(); process.stdin.on("end", () => console.log("fixture helper")); }
else createInterface({ input: process.stdin }).on("line", () => {
 console.log(JSON.stringify({ type: "result", subtype: "success", result: "fixture turn", session_id: "fixture-session", usage: {} }));
});
`;

let home: string;
let cli: string;
let callsPath: string;
const instances: ProviderInstance[] = [];
const subscription = { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" };

async function create(config: Record<string, unknown> = {}, environment: Record<string, string> = {}) {
  const instance = await ClaudeDriver.create({ instanceId: `fixture-subscription-${instances.length}`, displayName: "Fixture Claude", enabled: true,
    config: ClaudeDriver.decodeConfig({ cli, ...config }), environment: { FIXTURE_CALLS: callsPath, FIXTURE_AUTH: JSON.stringify(subscription), ...environment } });
  instances.push(instance);
  return instance;
}
function calls(): Array<{ args: string[]; env: Record<string, string> }> {
  return existsSync(callsPath) ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
}
function settings(value: unknown, directory = join(home, ".claude")) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "settings.json"), JSON.stringify(value));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "grokoff-claude-subscription-"));
  cli = join(home, "fake-claude.mjs");
  callsPath = join(home, "calls.ndjson");
  writeFileSync(cli, FAKE, { mode: 0o700 });
  vi.stubEnv("HOME", home);
  vi.stubEnv("CLAUDE_CONFIG_DIR", "");
  for (const key of CLAUDE_ACCOUNT_ENV_KEYS) vi.stubEnv(key, "");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("offline fixture", { status: 503 })));
});
afterEach(async () => {
  await Promise.all(instances.splice(0).map(instance => instance.dispose()));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeTempDir(home);
});

describe("Claude subscription billing boundary", () => {
  it("fails closed on a missing default CLI and keeps the installation status unavailable", async () => {
    const instance = await create({ cli: join(home, "missing-claude") });
    await expect(instance.adapter.sendTurn({ threadId: "missing", text: "must not launch", cwd: home })).rejects.toThrow("could not be verified");
    expect(await instance.snapshot()).toMatchObject({ state: "unavailable" });
    expect(calls()).toEqual([]);
  });

  it("labels only a confirmed first-party subscription, and keeps unknown auth unverified", () => {
    expect(claudeStatusBilling(subscription)).toBe("subscription");
    expect(claudeStatusBilling({ ...subscription, authMethod: "api_key" })).toBe("metered");
    expect(claudeStatusBilling({ loggedIn: true, authMethod: "console", apiProvider: "firstParty" })).toBe("metered");
    expect(claudeStatusBilling({ ...subscription, apiProvider: "bedrock" })).toBe("metered");
    expect(claudeStatusBilling({ ...subscription, subscriptionType: null })).toBeUndefined();
    expect(claudeStatusBilling({ loggedIn: true })).toBeUndefined();
  });

  it.each([
    { apiKeyHelper: "must-not-execute" },
    { env: { ANTHROPIC_API_KEY: "fixture-key" } },
    { env: { ANTHROPIC_BASE_URL: "https://fixture.invalid", ANTHROPIC_AUTH_TOKEN: "fixture-token" } },
    { env: { CLAUDE_CODE_USE_BEDROCK: "1" } },
  ])("blocks inherited billing settings before turns, helpers, or sign-in launch: %j", async value => {
    settings(value);
    const instance = await create();
    expect(await instance.snapshot()).toMatchObject({ authenticated: false, authenticationUnavailableReason: expect.stringContaining("API or third-party billing") });
    await expect(instance.adapter.sendTurn({ threadId: "blocked", text: "must not launch", cwd: home })).rejects.toThrow("API or third-party billing");
    await expect(instance.generateText!("must not launch")).rejects.toThrow("API or third-party billing");
    await expect(instance.reviewPermission!("must not launch")).rejects.toThrow("API or third-party billing");
    await expect(instance.startAuthentication!()).rejects.toThrow("API or third-party billing");
    expect(calls().some(call => call.args.includes("-p") || call.args.includes("login"))).toBe(false);
  });

  it("blocks project routing before a turn launches", async () => {
    const project = join(home, "project");
    settings({ env: { ANTHROPIC_AUTH_TOKEN: "fixture-project-token" } }, join(project, ".claude"));
    const instance = await create();
    await expect(instance.adapter.sendTurn({ threadId: "project", text: "must not launch", cwd: join(project, "child") })).rejects.toThrow("API or third-party billing");
    expect(calls().some(call => call.args.includes("-p"))).toBe(false);
  });

  it("does not turn ambient API routing into custom mode or hand it to a subscription turn", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "ambient-key");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "ambient-token");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://ambient.invalid");
    vi.stubEnv("CLAUDE_CODE_USE_VERTEX", "1");
    const instance = await create();
    expect(await instance.snapshot()).toMatchObject({ authenticated: true, billing: "subscription" });
    const recorder = recordEvents(instance.adapter);
    await instance.adapter.sendTurn({ threadId: "clean", text: "offline fixture", cwd: home });
    await recorder.until(event => event.type === "turn.completed");
    recorder.stop();
    const turn = calls().find(call => call.args.includes("-p"));
    expect(turn).toBeDefined();
    for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_VERTEX"]) expect(turn!.env[key]).toBeUndefined();
  });

  it.each(["api_key", "console"])("blocks CLI %s auth before paid turns/helpers and never claims subscription", async authMethod => {
    const instance = await create({}, { FIXTURE_AUTH: JSON.stringify({ loggedIn: true, authMethod, apiProvider: "firstParty" }) });
    const snapshot = await instance.snapshot();
    expect(snapshot).toMatchObject({ authenticated: false, reason: expect.stringContaining("API or Console") });
    expect(snapshot.authenticationUnavailableReason).toBeUndefined();
    expect(snapshot.billing).not.toBe("subscription");
    await expect(instance.adapter.sendTurn({ threadId: "console", text: "must not launch", cwd: home })).rejects.toThrow("API or Console");
    await expect(instance.generateText!("must not launch")).rejects.toThrow("API or Console");
    expect(calls().some(call => call.args.includes("-p"))).toBe(false);
  });

  it.each([
    { loggedIn: true },
    { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: null },
    { loggedIn: true, authMethod: "future-method", apiProvider: "firstParty", subscriptionType: "max" },
  ])("fails closed for unverified subscription metadata before tasks and helpers: %j", async status => {
    const instance = await create({}, { FIXTURE_AUTH: JSON.stringify(status) });
    expect(await instance.snapshot()).toMatchObject({ authenticated: false, reason: expect.stringContaining("could not be verified") });
    await expect(instance.adapter.sendTurn({ threadId: "unknown", text: "must not launch", cwd: home })).rejects.toThrow("could not be verified");
    await expect(instance.generateText!("must not launch")).rejects.toThrow("could not be verified");
    await expect(instance.reviewPermission!("must not launch")).rejects.toThrow("could not be verified");
    expect(calls().some(call => call.args.includes("-p"))).toBe(false);
    const custom = await create({ authMode: "custom" }, { FIXTURE_AUTH: JSON.stringify(status) });
    expect(await custom.generateText!("offline custom fixture")).toBe("fixture helper");
  });

  it.each([
    { loggedIn: false, authMethod: "none", apiProvider: "firstParty" },
    { loggedIn: true, authMethod: "api_key", apiProvider: "firstParty" },
    { loggedIn: true },
  ])("allows subscription sign-in repair from signed-out/API/unverified accounts: %j", async status => {
    const instance = await create({}, { FIXTURE_AUTH: JSON.stringify(status) });
    expect((await instance.snapshot()).authenticationUnavailableReason).toBeUndefined();
    const start = await instance.startAuthentication!();
    expect(start).toMatchObject({ phase: "waiting", authorizationUrl: expect.stringContaining("https://claude.com/") });
    expect(calls().some(call => JSON.stringify(call.args) === JSON.stringify(["auth", "login", "--claudeai"]))).toBe(true);
    await instance.completeAuthentication!(start.flowId!, "FIXTURECODE#abc");
    expect(await instance.snapshot()).toMatchObject({ authenticated: true, billing: "subscription" });
  });

  it("preserves explicitly configured API/custom routing and decodes its opt-in", async () => {
    settings({ apiKeyHelper: "fixture-helper", env: { ANTHROPIC_AUTH_TOKEN: "fixture-settings-token" } });
    expect(ClaudeDriver.decodeConfig({ authMode: "custom" }).authMode).toBe("custom");
    expect(() => ClaudeDriver.decodeConfig({ authMode: "guess" })).toThrow("authMode");
    const explicit = await create({}, { ANTHROPIC_BASE_URL: "http://127.0.0.1:9", ANTHROPIC_AUTH_TOKEN: "explicit-fixture-token" });
    expect(await explicit.generateText!("offline fixture")).toBe("fixture helper");
    expect(calls().find(call => call.args.includes("-p"))!.env.ANTHROPIC_AUTH_TOKEN).toBe("explicit-fixture-token");
    const custom = await create({ authMode: "custom" });
    expect(await custom.generateText!("offline fixture")).toBe("fixture helper");
    expect(await custom.snapshot()).toMatchObject({ authenticated: true, billing: "metered" });
    const api = await create({ requireApiKey: true }, { ANTHROPIC_API_KEY: "explicit-api-key" });
    expect(await api.generateText!("offline fixture")).toBe("fixture helper");
    expect(await api.snapshot()).toMatchObject({ authenticated: true, billing: "metered", account: { method: "api-key" } });
  });
});
