// GrokOff modification (2026-10-09): preserve the platform allowlist in hermetic launches and attest restart ownership.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { runControlOmb, verificationServerEnvironment } from "../scripts/control-omb.ts";
import * as verification from "../scripts/control-omb.ts";
import { handleToolCall, request } from "../scripts/mcp-server.ts";
import { waitForExit } from "./testing/cleanup.ts";

function launchRoomFixture() {
  return verification.launchVerificationServer(process.env);
}
function roomRestartEnvironment(dataDir: string, port: number) {
  return verificationServerEnvironment(process.env, dataDir, port);
}

it("retains the platform allowlist for initial and restarted room fixtures without leaking private env", async () => {
  vi.stubEnv("SYSTEMROOT", "C:\\fixture-windows");
  vi.stubEnv("COMSPEC", "C:\\fixture-windows\\System32\\cmd.exe");
  vi.stubEnv("XAI_API_KEY", "inert-room-env-sentinel");
  const marker = new Error("inert launch interception");
  const launch = vi.spyOn(verification, "launchVerificationServer").mockRejectedValue(marker);
  try {
    await expect(launchRoomFixture()).rejects.toBe(marker);
    const parent = launch.mock.calls[0]![0];
    const dataDir = join("synthetic-room", "data");
    const initial = verificationServerEnvironment(parent!, dataDir, 54321);
    const restarted = roomRestartEnvironment(dataDir, 54321);
    for (const env of [initial, restarted]) {
      expect(env.SYSTEMROOT).toBe("C:\\fixture-windows");
      expect(env.COMSPEC).toBe("C:\\fixture-windows\\System32\\cmd.exe");
      expect(env.XAI_API_KEY).toBeUndefined();
      expect(env.HOME).toBe(dataDir);
      expect(env.USERPROFILE).toBe(dataDir);
      expect(env.OMB_TEST_SEALED_PATH).toBe("1");
    }
  } finally {
    launch.mockRestore();
    vi.unstubAllEnvs();
  }
});

it("boots and reports an interrupted routine back to its source room", async () => {
  const fixture = await launchRoomFixture();
  const { url, dataDir, logPath } = fixture.info;
  let restarted: ChildProcess | undefined;
  try {
    const { bot } = await runControlOmb(["new-bot", "--name", "Recovery lead", "--url", url]) as any;
    const { channel } = await handleToolCall("create_channel", { name: "Recovery room", member_ids: [bot.id] },
      (path, options) => request(path, options, url)) as any;
    await waitForExit(fixture.child, { signal: "SIGTERM" });
    expect(fixture.child.exitCode !== null || fixture.child.signalCode !== null).toBe(true);
    // Reproduce the persisted state of an interrupted process, not a second
    // live writer. Recovery must emit its group/card changes during startup.
    writeFileSync(join(dataDir, "routines.json"), JSON.stringify({ version: 1, routines: [], runs: [{
      id: "interrupted-room-run", routineId: "interrupted-routine", routineName: "Room report",
      botId: bot.id, target: "bot", runOn: "maus", sourceThreadId: channel.activeTaskId,
      status: "running", prompt: "Report once", createdAt: Date.now(), scheduledFor: Date.now(),
    }] }));
    const env = roomRestartEnvironment(dataDir, Number(new URL(url).port));
    const log = openSync(logPath, "a", 0o600);
    restarted = spawn(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./index.ts", import.meta.url))], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), env, stdio: ["ignore", log, log],
    });
    closeSync(log);
    expect(restarted.pid).toBeDefined();
    expect(restarted.pid).not.toBe(fixture.info.pid);
    await expect.poll(async () => {
      if (restarted!.exitCode !== null || restarted!.signalCode !== null) throw new Error(readFileSync(logPath, "utf8"));
      return fetch(url + "/api/health", { signal: AbortSignal.timeout(3_000) })
        .then(r => r.ok ? r.json() : null)
        .then(health => health && typeof health === "object" && "pid" in health ? health.pid : null).catch(() => null);
    }, { timeout: 10_000, interval: 150 }).toBe(restarted.pid);
    const { runs } = await request("/api/routines", {}, url) as any;
    expect(runs[0]).toMatchObject({ status: "failed", error: "OpenMausBot restarted while this routine was running" });
    const { messages } = await request(`/api/threads/${channel.activeTaskId}/messages`, {}, url) as any;
    expect(messages.filter((m: any) => m.routineRun?.runId === "interrupted-room-run"))
      .toMatchObject([{ routineRun: { status: "failed" } }]);
    const { groups } = await request("/api/bots", {}, url) as any;
    expect(groups.find((g: any) => g.id === channel.id).working).toBe(false);
    // Store deliberately catches subscriber exceptions, so a healthy server
    // alone does not prove that recovery broadcasts were safe.
    expect(readFileSync(logPath, "utf8")).not.toMatch(/ReferenceError|store: change listener threw/);
  } finally {
    try {
      await waitForExit(restarted, { signal: "SIGTERM" });
      expect(!restarted || restarted.exitCode !== null || restarted.signalCode !== null).toBe(true);
    } finally { await fixture.close(); }
  }
}, 30_000);
