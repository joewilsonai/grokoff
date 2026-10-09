// GrokOff: explicit memory edits, corrections and recall across an owned server restart.
// Model replies are scripted; this checks persistence/plumbing, not model judgment.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb, verificationServerEnvironment, type VerificationServer } from "../scripts/control-omb.ts";
import { waitForExit } from "./testing/cleanup.ts";
import type { WireBot } from "../shared/wire.ts";

type Doc = { text: string; hash: string };
type Edit = Doc & { entry: { id: string; actor: string; via: string; path: string } };

it("preserves explicit memory, correction history and topic recall in a fresh server", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "grokoff-memory-continuity-"));
  const prompts = join(scratch, "prompts.jsonl");
  const env = { FAKE_CLAUDE_PROMPTS: prompts, FAKE_CLAUDE_REPLIES: '["Fixture response"]' };
  let fixture: VerificationServer | undefined;
  let restarted: ChildProcess | undefined;
  try {
    fixture = await launchVerificationServer(env);
    const { url, dataDir, pid: firstPid } = fixture.info;
    expect(new URL(url).hostname).toBe("127.0.0.1");
    const api = async <T = any>(path: string, method = "GET", body?: unknown, status = 200): Promise<T> => {
      const response = await fetch(url + path, {
        method, headers: { "content-type": "application/json", origin: url },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(5_000),
      });
      expect(response.status, `${method} ${path}`).toBe(status);
      return response.json() as Promise<T>;
    };
    expect(await api("/api/health")).toMatchObject({ pid: firstPid });
    const { bot } = await api<{ bot: WireBot }>("/api/bots", "POST", { name: "Continuity" }, 201);
    await api(`/api/bots/${bot.id}`, "PATCH", { memoryUpkeep: false });
    const memoryPath = `/api/bots/${bot.id}/memory/file`;
    const original = await api<Doc>(memoryPath + "?path=MEMORY.md");
    const preference = "Prefers compact project reports";
    const saved = await api<Edit>(memoryPath, "PUT", {
      path: "MEMORY.md", text: `# Memory\n\n- 2026-10-09 · ${preference}\n`, expectedHash: original.hash,
    });
    expect(saved.entry).toMatchObject({ actor: "person", via: "ui", path: "MEMORY.md" });
    const correctedPreference = "Prefers detailed project reports";
    const corrected = await api<Edit>(memoryPath, "PUT", {
      path: "MEMORY.md", text: `# Memory\n\n- 2026-10-09 · ${correctedPreference}\n`, expectedHash: saved.hash,
    });
    await api(memoryPath, "PUT", { path: "MEMORY.md", text: "Obsolete editor value", expectedHash: saved.hash }, 409);
    const topic = "memory/fixture-launch.md";
    const marker = "The synthetic launch venue is Copper Harbor";
    const topicText = `---\ntitle: Fixture launch\naliases: [launchsite]\n---\n- ${marker}\n`;
    const topicSaved = await api<Edit>(memoryPath, "PUT", { path: topic, text: topicText });

    // End the process, not just a transport. Keep its owned data until the
    // replacement has exited; fixture.close() performs final data cleanup.
    await waitForExit(fixture.child, { signal: "SIGTERM" });
    expect(fixture.child.exitCode !== null || fixture.child.signalCode !== null).toBe(true);
    restarted = spawn(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./index.ts", import.meta.url))], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: verificationServerEnvironment(env, dataDir, Number(new URL(url).port)),
      stdio: "ignore",
    });
    expect(restarted.pid).toBeDefined();
    expect(restarted.pid).not.toBe(firstPid);
    const replacement = restarted;
    await expect.poll(async () => {
      if (replacement.exitCode !== null || replacement.signalCode !== null) throw new Error("Owned replacement server exited before readiness");
      try { return (await api("/api/health")).pid; } catch { return null; }
    }, { timeout: 20_000 }).toBe(restarted.pid);

    expect(await api<Doc>(memoryPath + "?path=MEMORY.md")).toMatchObject({ text: corrected.text, hash: corrected.hash });
    expect(await api<Doc>(memoryPath + `?path=${encodeURIComponent(topic)}`)).toMatchObject({ text: topicText, hash: topicSaved.hash });
    const journal = await api<{ entries: Edit["entry"][] }>(`/api/bots/${bot.id}/memory/journal`);
    expect(journal.entries.map(row => row.id)).toEqual(expect.arrayContaining([saved.entry.id, corrected.entry.id, topicSaved.entry.id]));
    const preview = JSON.stringify(await api(`/api/bots/${bot.id}/system-prompt`));
    expect(preview).toContain(correctedPreference);
    expect(preview).not.toContain(preference);

    const { task } = await api<{ task: { threadId: string } }>(`/api/bots/${bot.id}/tasks`, "POST", { title: "After restart" }, 201);
    const before = existsSync(prompts) ? readFileSync(prompts, "utf8").length : 0;
    const control = (...args: string[]) => runControlOmb([...args, "--url", url], { env: {} });
    await control("send", "--bot", bot.id, "--task", task.threadId, "--text", "Where is the launchsite?");
    expect(await control("wait", "--bot", bot.id, "--task", task.threadId, "--timeout", "30")).toMatchObject({ status: "settled" });
    const received = readFileSync(prompts, "utf8").slice(before);
    expect(received).toContain("Recalled for this message");
    expect(received).toContain(topic);
    expect(received).toContain(marker);
    const launch = JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8")) as { systemPrompt: string };
    expect(launch.systemPrompt).toContain(correctedPreference);

    // Undo remains available after a restart, and a deleted topic cannot
    // remain in a subsequent turn's recall merely because an index was cached.
    await api(`/api/bots/${bot.id}/memory/journal/${corrected.entry.id}/revert`, "POST");
    expect((await api<Doc>(memoryPath + "?path=MEMORY.md")).text).toBe(saved.text);
    await api(memoryPath + `?path=${encodeURIComponent(topic)}`, "DELETE");
    const afterDelete = readFileSync(prompts, "utf8").length;
    const { task: clean } = await api<{ task: { threadId: string } }>(`/api/bots/${bot.id}/tasks`, "POST", { title: "After deletion" }, 201);
    await control("send", "--bot", bot.id, "--task", clean.threadId, "--text", "Where is the launchsite?");
    expect(await control("wait", "--bot", bot.id, "--task", clean.threadId, "--timeout", "30")).toMatchObject({ status: "settled" });
    const cleanedPrompt = readFileSync(prompts, "utf8").slice(afterDelete);
    expect(cleanedPrompt).not.toContain(marker);
    const cleanLaunch = JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8")) as { systemPrompt: string };
    expect(cleanLaunch.systemPrompt).toContain(preference);
    expect(cleanLaunch.systemPrompt).not.toContain(correctedPreference);
  } finally {
    await waitForExit(restarted, { signal: "SIGTERM" });
    if (restarted) expect(restarted.exitCode !== null || restarted.signalCode !== null).toBe(true);
    const dataDir = fixture?.info.dataDir;
    await fixture?.close();
    if (fixture) expect(fixture.child.exitCode !== null || fixture.child.signalCode !== null).toBe(true);
    if (dataDir) expect(existsSync(dataDir)).toBe(false);
    rmSync(scratch, { recursive: true, force: true });
    expect(existsSync(scratch)).toBe(false);
  }
}, 90_000);
