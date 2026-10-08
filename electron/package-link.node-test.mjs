// GrokOff modification (2026-10-08): public app links use the distinct grokoff scheme.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { packageUrlFromCommandLine, packageUrlFromDeepLink } from "./package-link.mjs";

describe("BotMRR package deep links", () => {
  it("accepts a public GitHub package URL", () => {
    const target = "https://raw.githubusercontent.com/acme/bots/main/reddit-lead-miner.md";
    assert.equal(packageUrlFromDeepLink(`grokoff://install?url=${encodeURIComponent(target)}`), target);
    assert.equal(packageUrlFromCommandLine(["OpenMausBot", "--flag", `grokoff://install?url=${encodeURIComponent(target)}`]), target);
  });

  it("rejects other commands, hosts, protocols, credentials, and unsupported file types", () => {
    assert.equal(packageUrlFromDeepLink("grokoff://settings"), null);
    assert.equal(packageUrlFromDeepLink("grokoff://install?url=https://evil.example/bot.json"), null);
    assert.equal(packageUrlFromDeepLink("grokoff://install?url=http://raw.githubusercontent.com/a/b/main/bot.json"), null);
    assert.equal(packageUrlFromDeepLink("grokoff://install?url=https://user@example.com/bot.json"), null);
    assert.equal(packageUrlFromDeepLink("grokoff://install?url=https://github.com/acme/bot/run.sh"), null);
  });
});
