# smol-toml

GrokOff uses smol-toml 1.9.0 to read configured Codex MCP server names from
TOML. The server bundle includes the parser; this directory preserves its
license for source and binary distributions.

- Source: https://github.com/squirrelchat/smol-toml
- Package: https://www.npmjs.com/package/smol-toml/v/1.9.0
- License: BSD-3-Clause, reproduced in [LICENSE](LICENSE).

The dependency is pinned in package.json and pnpm-lock.yaml. GrokOff reads
configuration without rewriting it. Native Codex configuration confirmation
remains the final check before a task with selected tools runs.
