# Interrupted tool receipts

When Stop ends a turn before a provider reports a tool result, the saved tool
receipt shows **Interrupted** in tool details and the run log. Its `ok` and
output remain unrecorded. Check what happened before repeating an action;
stopping a tool does not prove that an external side effect was undone.
Completed and failed calls keep their original outcomes. Legacy records without
an interruption field remain readable with their original status.

Run from the checkout with Node 24 and the pinned pnpm:

```sh
pnpm exec vitest run server/tool-messages.test.ts server/interrupted-tools.e2e.test.ts server/task-timeline.test.ts src/components/ToolActivity.test.ts src/components/ToolActivity.interaction.test.ts src/components/RunLog.test.ts
```

The HTTP regression owns its loopback URL, temporary data/home, server and
scripted Claude CLI. It emits a completed call, a failed call and an unfinished
browser-shaped call, then uses the real interrupt route. It verifies the
unfinished receipt, unchanged actual outcomes and identical saved receipts
after restarting only that owned server. Cleanup waits for those exact child
processes and verifies their absence before the temporary data is removed.
This POSIX wrapper/restart test is skipped on Windows; the maintained Ubuntu CI
runs it. No browser is launched and no webpage is changed.

The real disposable Store controls test exact turn/thread/bot isolation,
idempotent interruption, persisted unknown outcomes, legacy receipts and a late
completion whose item ID has been reused by a replacement turn. The late event
must neither overwrite the replacement's row nor delete its pending entry;
the replacement's own completion must still work. This is a receipt ownership
check, not a claim that every late provider event is globally quarantined.

Actual React DOM controls open a running disclosure, rerender its stopped
receipt while retaining input/open state, preserve known success/failure, and
compare interrupted/running/failed/completed rows in the real run log. Fetch is
forbidden in that renderer fixture. No live account, real user data, native
app, browser control or provider performance is covered. The complete selected
files are part of `pnpm test:core`; the usual source gates remain required.
