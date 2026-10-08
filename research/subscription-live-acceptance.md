# Live subscription acceptance — 2026-10-08

This public summary records bounded maintainer checks. Original local receipts,
review transcripts, account metadata and the verification runner are retained
privately. They are not distributed with the source repository.

## Observed result

Claude Sonnet 5.5 and Codex GPT-6-Astra at Medium each completed a real GrokOff
server task: request one fixed local MCP challenge-file read, obtain a one-time
approval, read the challenge, and return the exact expected assistant response.
The tested CLI versions were Claude Code 2.1.295 and Codex 0.153.2. Model and
subscription availability can differ between versions and accounts.

The runner used the production server/provider adapters with disposable app
data, bots and a temporary workspace. Every mutation targeted that owned
server's explicit loopback URL. It reused official CLI-managed sign-in without
copying credentials or changing account configuration. API keys, tokens and
base-URL overrides were excluded from its environment. Ordinary OS identity
variables were retained for macOS credential lookup.

Native tools and auxiliary model calls were disabled. The only requested
operation was the fixed challenge-file tool, with no path argument. Its one-time
approval created no remembered grant. Owned app processes and temporary data
were cleaned up; native provider history was retained. No quota, billing or
credit warning was observed. Usage metrics do not prove that a provider cannot
apply additional charges; see [subscription connections](../docs/subscription-connections.md).

## Resolved blockers and evidence limits

An initial Claude environment probe could not confirm login because it omitted
ordinary OS identity variables. A subsequent inference requested the correct
tool, but the test runner mistook its approval card for terminal state and
interrupted it before the read. The corrected replacement task passed.

Codex initially refused execution before sending a prompt: its inherited-MCP
scan missed an inline TOML declaration, leaving an ambient server enabled.
The strict configuration guard correctly blocked that state. A names-parser
correction disabled every inherited entry before the successful task. The
strict effective-configuration guard was not relaxed and no global Codex
configuration was changed.

The final [configuration parser](../server/drivers/codex-mcp-names.ts) uses
smol-toml 1.9.0. Regression cases cover multiline instruction examples, quoted
parents, root inline tables, Unicode names and large valid integers. A native
metadata-only check after this final parser change confirmed all inherited
entries disabled and shell snapshots off. No additional inference was run after
the final parser replacement; distinguish the live acceptance from this later
metadata/regression verification.

## Related local verification

- Parser and Codex driver suite: 249 tests passed across two files.
- Application typecheck, scoped lint and diff checks passed.
- Independent review identified and then confirmed fixes for the handwritten
  parser's multiline, quoted-table and Unicode handling; final scoped review
  reported no findings. Review did not replace test execution.
- Server build, local Apple Silicon packaging and isolated packaged-server
  smoke passed. The smoke exercised startup outside the repository, all 13
  proxy paths, MCP response draining, encrypted backup export, child cleanup
  and desktop-entry restart with its compiled cache.

This is a narrow subscription chat-and-tool result. It does not establish every
model's availability, packaged-renderer acceptance, browser UI control, quota
recovery, reconnect behavior or general agent reliability. Local historical
results supplement reproducible contributor checks; they do not replace them.
