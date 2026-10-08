import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { resolveCompanionDataDir } from "../src/state.ts";

vi.mock("node:fs", { spy: true });

let fixtureHome: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
  if (fixtureHome) rmSync(fixtureHome, { recursive: true, force: true });
  fixtureHome = undefined;
});

it("defaults to GrokOff's paired fleet and only honors explicitly configured paths", () => {
  const home = join(tmpdir(), "grokoff-namespace-fixture");
  const legacyFixture = join(home, "explicit-legacy-fixture");
  const ownFixture = join(home, "explicit-grokoff-fixture");
  expect(resolveCompanionDataDir({}, home)).toBe(join(home, ".grokoff-companion"));
  expect(resolveCompanionDataDir({ OMB_COMPANION_DIR: legacyFixture }, home)).toBe(legacyFixture);
  expect(resolveCompanionDataDir({ GROKOFF_COMPANION_DIR: ownFixture, OMB_COMPANION_DIR: legacyFixture }, home)).toBe(ownFixture);
  // An empty fork override suppresses an inherited legacy path.
  expect(resolveCompanionDataDir({ GROKOFF_COMPANION_DIR: "", OMB_COMPANION_DIR: legacyFixture }, home)).toBe(join(home, ".grokoff-companion"));
});

it("cannot authenticate upstream devices while its own pairing survives restart", async () => {
  fixtureHome = mkdtempSync(join(tmpdir(), "grokoff-pairing-namespace-"));
  vi.stubEnv("HOME", fixtureHome);
  vi.stubEnv("USERPROFILE", fixtureHome);
  vi.stubEnv("GROKOFF_COMPANION_DIR", undefined);
  vi.stubEnv("OMB_COMPANION_DIR", undefined);

  const upstreamDir = join(fixtureHome, ".openmausbot-companion");
  mkdirSync(upstreamDir, { mode: 0o700 });
  const upstreamToken = "omb_upstream-device-fixture";
  const upstreamRecord = JSON.stringify({ devices: [{
    id: "upstream-phone",
    name: "Upstream phone",
    tokenHash: createHash("sha256").update(upstreamToken).digest("hex"),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    cloudDesktopAccess: true,
    browserControlAccess: true,
  }] });
  const upstreamFile = join(upstreamDir, "devices.json");
  writeFileSync(upstreamFile, upstreamRecord, { mode: 0o600 });

  vi.resetModules();
  const { DATA_DIR } = await import("../src/state.ts");
  const { DeviceRegistry } = await import("../src/devices.ts");
  expect(DATA_DIR).toBe(join(fixtureHome, ".grokoff-companion"));
  const registry = new DeviceRegistry();
  expect(registry.list()).toEqual([]);
  expect(registry.authenticate(upstreamToken)).toBeNull();

  const { code } = registry.openPairing();
  const paired = registry.redeem(code, "GrokOff phone");
  if ("error" in paired) throw new Error(paired.error);
  expect(registry.authenticate(paired.token)?.id).toBe(paired.device.id);
  expect(paired.device.browserControlAccess).toBe(false);

  const restarted = new DeviceRegistry();
  expect(restarted.authenticate(upstreamToken)).toBeNull();
  expect(restarted.authenticate(paired.token)?.id).toBe(paired.device.id);
  expect(restarted.list()).toHaveLength(1);
  expect(vi.mocked(readFileSync).mock.calls.map(([file]) => file)).not.toContain(upstreamFile);
  expect(readFileSync(upstreamFile, "utf8")).toBe(upstreamRecord);
  expect(readFileSync(join(DATA_DIR, "devices.json"), "utf8")).not.toContain(paired.token);
});
