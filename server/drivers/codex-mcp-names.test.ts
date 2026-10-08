// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codexConfigMcpServerNames, mcpServerNamesInToml, mountedMcpServerName } from "./codex-mcp-names.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }); });

describe("mcpServerNamesInToml", () => {
  it("collects bare, quoted and sub-table headers and ignores everything else", () => {
    const toml = `
model = "gpt-5"
[mcp_servers.fibery]
url = "https://mcp-eu-svc.fibery.io/mcp"
  [ mcp_servers.google_ads-http ]
url = "https://example.test/mcp"
[mcp_servers."with space"]
command = "npx"
[mcp_servers.'single']
command = "npx"
[mcp_servers.nested.env]
TOKEN = "x"
[projects."/tmp/mcp_servers.decoy"]
trust_level = "trusted"
# [mcp_servers.commented]
`;
    expect([...mcpServerNamesInToml(toml)].sort()).toEqual(["fibery", "google_ads-http", "nested", "single", "with space"]);
  });

  it("returns nothing for a config without servers", () => {
    expect(mcpServerNamesInToml('model = "gpt-5"\n').size).toBe(0);
  });

  it.each([
    '["mcp_servers".cap]\ncommand = "fixture"\n',
    'mcp_servers = { cap = { command = "fixture" } }\n',
  ])("collects quoted parent keys and root inline tables: %s", toml => {
    expect([...mcpServerNamesInToml(toml)]).toEqual(["cap"]);
  });

  it("decodes escaped quoted names before detecting mount collisions", () => {
    const names = mcpServerNamesInToml(String.raw`
[mcp_servers."\u0063ap"]
command = "fixture"
[mcp_servers."\U0001F916"]
command = "fixture"
`);
    expect([...names]).toEqual(["cap", "🤖"]);
    expect(mountedMcpServerName("cap", names)).toBe("cap_openmausbot");
  });

  it("ignores unrelated valid integers outside JavaScript's safe range", () => {
    expect([...mcpServerNamesInToml('unrelated = 9223372036854775807\n[mcp_servers.cap]\ncommand = "fixture"\n')]).toEqual(["cap"]);
  });

  it("returns no names for malformed config or a non-table MCP value", () => {
    for (const toml of ['[mcp_servers.cap\n', 'mcp_servers = "invalid"\n', 'mcp_servers = []\n']) {
      expect(mcpServerNamesInToml(toml).size).toBe(0);
    }
  });

  it("collects inline and dotted server assignments without taking unrelated table keys", () => {
    const toml = `
[mcp_servers] # valid inline declarations used by Codex
cap = { command = "fixture", args = ["safe"] }
"quoted inline" = { url = "https://example.test" }
'literal inline' = { command = "fixture" }
dotted.command = "fixture"
dotted.args = []
# commented = { command = "must-not-be-scanned" }
[profiles.example]
unrelated = { command = "must-not-be-scanned" }
[mcp_servers.header]
command = "fixture"
[mcp_servers.header.env]
TOKEN = "synthetic-only"
`;
    expect([...mcpServerNamesInToml(toml)].sort()).toEqual([
      "cap", "dotted", "header", "literal inline", "quoted inline",
    ]);
  });

  it("collects direct root dotted assignments", () => {
    expect([...mcpServerNamesInToml(`
mcp_servers.direct = { command = "fixture", args = [] }
mcp_servers.'direct quoted'.command = "fixture"
`) ].sort()).toEqual(["direct", "direct quoted"]);
  });

  it("ignores declarations inside multiline basic and literal instructions while keeping adjacent real entries", () => {
    const toml = String.raw`
mcp_servers.before = { command = "fixture" }
developer_instructions = """
mcp_servers.phantom_basic = { command = "must-not-run" }
[mcp_servers.phantom_basic_table]
command = "must-not-run"
An escaped delimiter: \""" is still instruction text.
mcp_servers.phantom_after_escape = { command = "must-not-run" }
"""
other_instructions = '''
mcp_servers.phantom_literal = { command = "must-not-run" }
[mcp_servers.phantom_literal_table]
command = "must-not-run"
'''
# """ comments never open a string or a table
# [mcp_servers.phantom_comment]
mcp_servers.after = { command = "fixture", args = ["# not a comment", "''' not a delimiter"] }
mcp_servers."quoted#name" = { command = "fixture" }
[mcp_servers.header_after]
command = "fixture"
`;
    expect([...mcpServerNamesInToml(toml)].sort()).toEqual(["after", "before", "header_after", "quoted#name"]);
  });

  it("keeps declarations after valid four/five-quote multiline terminators", () => {
    const toml = 'developer_instructions = """text ending in a quote""""\n'
      + "literal_instructions = '''text ending in two quotes'''''\n"
      + 'mcp_servers.real = { command = "fixture" }\n';
    expect([...mcpServerNamesInToml(toml)]).toEqual(["real"]);
  });
});

describe("codexConfigMcpServerNames", () => {
  it("reads config.toml from CODEX_HOME, falling back to ~/.codex, and tolerates a missing file", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-codex-names-"));
    dirs.push(home);
    mkdirSync(join(home, ".codex"));
    writeFileSync(join(home, ".codex", "config.toml"), '[mcp_servers.home_one]\nurl = "https://a.test"\n');
    const codexHome = join(home, "elsewhere");
    mkdirSync(codexHome);
    writeFileSync(join(codexHome, "config.toml"), '[mcp_servers.explicit]\nurl = "https://b.test"\n');
    expect([...codexConfigMcpServerNames({ HOME: home })]).toEqual(["home_one"]);
    expect([...codexConfigMcpServerNames({ HOME: home, CODEX_HOME: codexHome })]).toEqual(["explicit"]);
    expect(codexConfigMcpServerNames({ HOME: home, CODEX_HOME: join(home, "missing") }).size).toBe(0);
  });

  it("reads inline declarations from the effective Codex home", () => {
    const home = mkdtempSync(join(tmpdir(), "grokoff-codex-inline-names-"));
    dirs.push(home);
    mkdirSync(join(home, ".codex"));
    writeFileSync(join(home, ".codex", "config.toml"), '[mcp_servers]\ncap = { command = "fixture", args = [] }\n');
    expect([...codexConfigMcpServerNames({ HOME: home })]).toEqual(["cap"]);
  });
});

describe("mountedMcpServerName", () => {
  it("keeps a free name and moves a taken one aside deterministically", () => {
    expect(mountedMcpServerName("notes", new Set())).toBe("notes");
    expect(mountedMcpServerName("fibery", new Set(["fibery"]))).toBe("fibery_openmausbot");
    expect(mountedMcpServerName("fibery", new Set(["fibery", "fibery_openmausbot"]))).toBe("fibery_openmausbot2");
  });
});
