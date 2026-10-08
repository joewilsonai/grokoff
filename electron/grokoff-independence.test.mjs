import { afterEach, expect, it, vi } from "vitest";
import { configureGrokOffIdentity, configuredServiceURL } from "./grokoff-policy.mjs";
import { createCloudAccountClient } from "./cloud-account.mjs";
import { createCompanionAccountService, resolveCompanionControlPlaneURL } from "./companion-account-service.mjs";

const fixture = vi.hoisted(() => ({ handlers: new Map(), loadVendor: vi.fn() }));
vi.mock("electron", () => ({
  app: { isPackaged: true }, clipboard: {},
  ipcMain: { handle: (name, handler) => fixture.handlers.set(name, handler) },
}));
vi.mock("node:module", () => ({ createRequire: () => fixture.loadVendor }));

afterEach(() => { vi.useRealTimers(); fixture.handlers.clear(); fixture.loadVendor.mockClear(); });

it("puts the Electron profile and logs in GrokOff's identity before other desktop work", () => {
  const calls = [];
  const app = {
    setName: value => calls.push(["name", value]),
    getPath: key => { calls.push(["read", key]); return "/fixture/app-data"; },
    setPath: (key, value) => calls.push(["path", key, value]),
    setAppLogsPath: (...args) => calls.push(["logs", ...args]),
  };
  configureGrokOffIdentity(app, { environment: {}, ensureDirectory: value => calls.push(["mkdir", value]) });
  expect(calls[0]).toEqual(["name", "GrokOff"]);
  expect(calls).toContainEqual(["path", "userData", "/fixture/app-data/GrokOff"]);
  expect(calls.at(-1)).toEqual(["logs"]);
  calls.length = 0;
  configureGrokOffIdentity(app, { environment: { GROKOFF_USER_DATA: "/fixture/profile", GROKOFF_LOGS_DIR: "/fixture/logs" }, ensureDirectory: () => {} });
  expect(calls).toContainEqual(["path", "userData", "/fixture/profile"]);
  expect(calls.at(-1)).toEqual(["logs", "/fixture/logs"]);
});

it("does not load an updater, set timers or allow a manual update through trusted IPC", async () => {
  vi.useFakeTimers();
  const updater = await import("./updater.mjs");
  updater.registerUpdaterIpc({ pageAllowed: event => event.trusted === true });
  updater.startUpdater();
  await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
  expect(fixture.loadVendor).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(fixture.handlers.get("update:get-state")({ trusted: true })).toMatchObject({ status: "idle", message: expect.stringContaining("unavailable") });
  expect(() => fixture.handlers.get("update:check")({ trusted: false })).toThrow("only available");
  expect(fixture.handlers.get("update:check")({ trusted: true })).toBeUndefined();
  expect(fixture.handlers.get("update:install")({ trusted: true })).toBeUndefined();
});

it("unconfigured Cloud cannot read an old grant, fetch, open a browser or claim a home", async () => {
  const fetch = vi.fn(), openBrowser = vi.fn(), read = vi.fn();
  const cloud = createCloudAccountClient({ store: { read }, openBrowser, fetch });
  await expect(cloud.start()).resolves.toMatchObject({ status: "unavailable" });
  await expect(cloud.begin()).rejects.toThrow("not configured");
  await expect(cloud.refresh()).resolves.toMatchObject({ status: "unavailable" });
  await expect(cloud.openDashboard()).rejects.toThrow("not configured");
  expect(cloud.homeTarget()).toBeNull();
  cloud.close();
  expect(read).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(openBrowser).not.toHaveBeenCalled();
});

it("unconfigured companion access stays unavailable without registering or reading another account", async () => {
  expect(resolveCompanionControlPlaneURL({ isPackaged: true, environment: {} })).toBe("");
  const readCredentials = vi.fn(), updateCredentials = vi.fn();
  const companion = createCompanionAccountService({ client: null, readCredentials, updateCredentials, identity: {} });
  await expect(companion.state()).resolves.toMatchObject({ available: false, message: expect.stringContaining("not configured") });
  await companion.restore();
  expect(updateCredentials).not.toHaveBeenCalled();
  expect(readCredentials).not.toHaveBeenCalled();
});

it("custom service configuration is explicit and an empty fork override suppresses a legacy override", () => {
  expect(configuredServiceURL({}, "GROKOFF_COMPOSIO_BROKER_URL", "OMB_COMPOSIO_BROKER_URL")).toBe("");
  expect(configuredServiceURL({ OMB_COMPOSIO_BROKER_URL: " https://own.example.test " }, "GROKOFF_COMPOSIO_BROKER_URL", "OMB_COMPOSIO_BROKER_URL")).toBe("https://own.example.test");
  expect(configuredServiceURL({ GROKOFF_COMPOSIO_BROKER_URL: "", OMB_COMPOSIO_BROKER_URL: "https://old.example.test" }, "GROKOFF_COMPOSIO_BROKER_URL", "OMB_COMPOSIO_BROKER_URL")).toBe("");
  expect(resolveCompanionControlPlaneURL({ environment: { GROKOFF_CONTROL_PLANE_URL: "https://user:secret@own.example.test" } })).toBe("");
});
