// GrokOff regression: run the real packaged smoke with poisoned CLI discovery.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function stopOwnedGroup(pid) {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  const deadline = Date.now() + 5_000;
  while (true) {
    try { process.kill(-pid, 0); } catch (error) { if (error.code === "ESRCH") return; throw error; }
    assert(Date.now() < deadline, "Owned smoke process group survived cleanup");
    await delay(20);
  }
}

// POSIX owns a detached process group for bounded failure cleanup. Windows
// still runs the normal packaged smoke; this additional trap test is skipped.
test("packaged smoke ignores ambient and Node-adjacent provider CLIs", {
  skip: process.platform === "win32",
  timeout: 170_000,
}, async () => {
  const fixture = mkdtempSync(join(tmpdir(), "grokoff-smoke-isolation-"));
  const bin = join(fixture, "bin");
  const home = join(fixture, "home");
  const temp = join(fixture, "tmp");
  const calls = join(fixture, "provider-calls.jsonl");
  const node = join(bin, "node");
  let smokePid;
  try {
    for (const directory of [bin, home, temp]) mkdirSync(directory, { mode: 0o700 });
    // A separate Node binary makes its actual process.execPath share the trap
    // directory. Keeping Node's installation directory on PATH would leak it.
    copyFileSync(process.execPath, node);
    chmodSync(node, 0o700);
    for (const provider of ["claude", "codex", "grok", "opencode", "qwen", "kimi", "droid", "gemini", "agy", "cursor-agent", "agent"]) {
      const cli = join(bin, provider);
      writeFileSync(cli, `#!${node}\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({provider:${JSON.stringify(provider)},args:process.argv.slice(2)})+"\\n");\nconsole.log("0.0.0-fixture");\n`, { mode: 0o700 });
    }
    const env = {
      PATH: bin,
      HOME: home,
      USERPROFILE: home,
      APPDATA: join(home, "AppData", "Roaming"),
      LOCALAPPDATA: join(home, "AppData", "Local"),
      XDG_CONFIG_HOME: join(home, ".config"),
      XDG_CACHE_HOME: join(home, ".cache"),
      XDG_DATA_HOME: join(home, ".local", "share"),
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      ...(process.env.OMB_SMOKE_DIST ? { OMB_SMOKE_DIST: process.env.OMB_SMOKE_DIST } : {}),
    };

    // Prove the contamination is executable, then clear only its owned receipt.
    const control = spawnSync("opencode", ["--version"], { env, encoding: "utf8", timeout: 5_000 });
    assert.equal(control.status, 0, String(control.error ?? control.stderr));
    assert.deepEqual(JSON.parse(readFileSync(calls, "utf8")), { provider: "opencode", args: ["--version"] });
    rmSync(calls);

    const smoke = spawnSync(node, [join(root, "scripts/smoke-packaged-server.mjs")], {
      cwd: root,
      env,
      encoding: "utf8",
      detached: true,
      timeout: 150_000,
      killSignal: "SIGKILL",
      maxBuffer: 2 * 1024 * 1024,
    });
    smokePid = smoke.pid;
    assert.equal(smoke.status, 0, `${smoke.error ?? ""}\n${smoke.stdout}\n${smoke.stderr}`);
    for (const result of [
      "packaged server started with no node_modules in reach",
      "spawned proxy paths resolve inside the packaged server dir",
      "packaged MCP stdio server reached the API and flushed its final frames",
      "packaged backup worker exported an encrypted archive",
      "packaged container launcher ran the server as its child and stopped it cleanly",
      "packaged desktop entry started the server twice on its compile cache",
    ]) assert(smoke.stdout.includes(result), `Missing actual smoke result: ${result}`);
    assert.equal(existsSync(calls), false, "A provider trap ran during the real packaged smoke");
  } finally {
    // Only this test's detached group can be stopped. Keep its home until all
    // owned children exit, including when the smoke failed before its cleanup.
    await stopOwnedGroup(smokePid);
    rmSync(fixture, { recursive: true, force: true });
  }
});
