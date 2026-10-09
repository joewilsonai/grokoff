// GrokOff modification (2026-10-09): maintain real backup/restore acceptance and owned-fixture failure cleanup.
import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { verifyWorkspaceBackup } from "../scripts/verify-workspace-backup.ts";

it("restores an encrypted workspace through the real server and continues its original chat", async () => {
  const result = await verifyWorkspaceBackup();
  console.info(JSON.stringify(result));
  expect(result).toMatchObject({
    ok: true, identicalIds: true, transcriptPreserved: true, conversationContinued: true,
    attachmentBytesPreserved: true, skillAndProfilePreserved: true, sourceCredentialsExcluded: true, destinationCredentialsUnchanged: true,
    clientStateAllowlisted: true, oldDataSafetyCopy: true,
  });
}, 150_000);

it.each(["source", "destination"] as const)("cleans every owned fixture when evidence reporting fails after %s launch", async (stage) => {
  const owned: Array<{ pid: number; dataDir: string }> = [];
  let cleanup: { cleanup: boolean; sourceRemoved: boolean; destinationRemoved: boolean } | undefined;
  await expect(verifyWorkspaceBackup((event) => {
    const record = event as Record<string, any>;
    for (const key of ["source", "destination"]) if (record[key]) owned.push(record[key]);
    if (Object.hasOwn(record, "cleanup")) cleanup = record as typeof cleanup;
    if (record[stage]) throw new Error("Synthetic evidence reporter failure");
  })).rejects.toThrow("Synthetic evidence reporter failure");
  expect(owned).toHaveLength(stage === "source" ? 1 : 2);
  expect(cleanup).toMatchObject({ cleanup: true, sourceRemoved: true, destinationRemoved: true });
  for (const fixture of owned) {
    expect(existsSync(fixture.dataDir)).toBe(false);
    expect(() => process.kill(fixture.pid, 0)).toThrow(/ESRCH/);
  }
// Destination failure follows two initial/restart launches (20s +30s each).
// Keep a bounded margin for exact owned-process cleanup before Vitest expires.
}, 150_000);
