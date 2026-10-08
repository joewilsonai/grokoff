// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
// MCP server names the user already declared in their own Codex config.
//
// Custom MCP servers reach codex as `-c mcp_servers.<name>.…` overrides, and
// codex merges an override into any same-named table in config.toml. A stdio
// command laid over a remote `url` entry is "invalid configuration": codex
// falls back to defaults, config/read fails, and the whole turn dies before
// the model is even asked. Mounting a colliding server under a name of its
// own keeps both definitions usable.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";

/** Read decoded server keys from the root TOML table, regardless of how it was
 * declared. This only discovers names; the app-server's effective configuration
 * remains the authority for whether every ambient entry was disabled before a
 * scoped prompt. Malformed files are left for that native configuration guard. */
export function mcpServerNamesInToml(toml: string): Set<string> {
  try {
    const servers = parse(toml, { integersAsBigInt: "asNeeded" }).mcp_servers;
    return servers && typeof servers === "object" && !Array.isArray(servers)
      ? new Set(Object.keys(servers))
      : new Set();
  } catch {
    return new Set();
  }
}

/** Server names in the config.toml of the Codex home this child will use. */
export function codexConfigMcpServerNames(env: Record<string, string | undefined>): Set<string> {
  const codexHome = env.CODEX_HOME || join(env.HOME || env.USERPROFILE || homedir(), ".codex");
  try {
    return mcpServerNamesInToml(readFileSync(join(codexHome, "config.toml"), "utf8"));
  } catch {
    return new Set();
  }
}

/** The name to mount a custom server under: its own, unless the user's Codex
 * config already has a server by that name. */
export function mountedMcpServerName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  let candidate = `${name}_openmausbot`;
  for (let i = 2; taken.has(candidate); i++) candidate = `${name}_openmausbot${i}`;
  return candidate;
}
