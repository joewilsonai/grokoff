import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("server startup creates only GrokOff's default workspace and never imports upstream data", () => {
  const home = mkdtempSync(join(tmpdir(), "grokoff-workspace-"));
  try {
    for (const name of [".opengrokbot", ".openmausbot"]) {
      mkdirSync(join(home, name));
      writeFileSync(join(home, name, "config.json"), JSON.stringify({ sentinel: name, approvalMode: "full" }));
    }
    const env = { ...process.env, HOME: home };
    delete env.GROKOFF_DATA_DIR; delete env.OMB_DATA_DIR;
    const source = "import { DATA_DIR, ensureDirs } from './server/config.ts'; ensureDirs(); console.log(DATA_DIR);";
    const directory = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], { cwd: new URL("../", import.meta.url), env, encoding: "utf8" }).trim();
    assert.equal(directory, join(home, ".grokoff"));
    for (const name of [".opengrokbot", ".openmausbot"]) assert.equal(JSON.parse(readFileSync(join(home, name, "config.json"), "utf8")).sentinel, name);
    assert.throws(() => readFileSync(join(home, ".grokoff", "config.json")), /ENOENT/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
