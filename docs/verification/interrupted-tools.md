# Interrupted tool receipts

When a provider records a turn completion with `stopReason: "interrupted"`
or `"cancelled"` before reporting a tool result, the saved unfinished tool
receipt shows **Interrupted** in tool details, the run log and command verification cards. Its `ok` and
output remain unrecorded. Check what happened before repeating an action;
stopping a tool does not prove that an external side effect was undone.
Completed and failed calls keep their original outcomes. Legacy records without
an interruption field remain readable with their original status.

Run from the checkout with Node 24 and the pinned pnpm:

```sh
pnpm exec vitest run server/tool-messages.test.ts server/interrupted-tools.e2e.test.ts server/task-timeline.test.ts src/components/ToolActivity.test.ts src/components/ToolActivity.interaction.test.ts src/components/RunLog.test.ts src/lib/verify-steps.test.ts src/components/VerifyCard.test.ts server/mcp-server.test.ts
```

The HTTP regression owns its loopback URL, temporary data/home, server and
scripted Claude CLI. It emits a completed call, a failed call and an unfinished
browser-shaped call, then uses the real interrupt route. It verifies the
unfinished receipt, unchanged actual outcomes and identical saved receipts
after restarting only that owned server. Cleanup waits for those exact child
processes and verifies their absence before the temporary data is removed.
A second owned server uses the real ACP adapter and scripted fake ACP CLI.
Its normal interrupt route produces `cancelled` with `ok: true`; the event
retains those provider values while the unfinished tool outcome stays unknown.
An owned process-exit control produces `exit_before_result` with `ok: false`
and is not relabeled as interrupted. Unknown exits, crashes, and historical
unfinished receipts loaded at restart are outside the cancellation rule.

These POSIX wrapper/restart tests are skipped on Windows; the maintained Ubuntu CI
runs them. No browser is launched and no webpage is changed.

The real disposable Store controls test exact turn/thread/bot isolation,
idempotent interruption, persisted unknown outcomes, legacy receipts and a late
completion whose item ID has been reused by a replacement turn. The late event
must neither overwrite the replacement's row nor delete its pending entry;
the replacement's own completion must still work. This is a receipt ownership
check, not a claim that every late provider event is globally quarantined.

Actual React DOM controls open a running disclosure, rerender its stopped
receipt while retaining input/open state, preserve known success/failure, and
compare interrupted/running/failed/completed rows in the real run log. The actual
verification card stops spinning, displays the unknown-outcome warning and removes
the verified badge for interrupted commands. A mixed run may fill a skill draft
only when it has proven passing work and no still-running steps; the draft marks
interrupted commands as outcome-unknown notes to check and excludes them from the
recipe. It never sends or repeats them. An all-interrupted run offers no Save.
Fetch is
forbidden in that renderer fixture. No live account, real user data, native
app, browser control or provider performance is covered. The complete selected
files are part of `pnpm test:core`; the usual source gates remain required.

The bounded MCP bot/channel message and conversation-wait projections retain only
the boolean `interrupted: true` marker. Legacy absent markers remain absent;
recorded success/failure and existing transcript bounds/redaction are preserved.
An interrupted tool does not turn a settled conversation into a failed one. The
HTTP fixture checks the projected stopped receipt through the production MCP
handler with its exact owned server transport; no port discovery is allowed.
