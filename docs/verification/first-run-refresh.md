# First-run connection checks

Run the real NoEngines fallback screen and StoreProvider in disposable Electron
windows, using only synthetic unavailable Claude/Codex inventory:

```sh
node --experimental-strip-types scripts/verify-provider-refresh.ts --no-engines
```

The fixture checks the local setup screen and remote host fallback at 900px
and 390px. An explicit **Check again** that returns HTTP 503 shows a readable
warning, preserves the previous inventory and unlocks retry. A successful
retry clears that warning and updates the inventory. A real stalled HTTP
request is aborted at the shared ten-second deadline; its socket must close
before the fixture window exits. Background focus failures remain quiet.
The retry button and warning remain reachable in the narrow layout.

This reuses the [provider refresh fixture](provider-refresh.md): an owned
temporary home/profile, dynamically allocated loopback origin, denied native
permissions and external requests, and rejection of every API mutation. It
starts no harness server or provider process and accesses no saved login or
personal app. Synthetic receipt paths and screenshots remain under ignored
`.local`; cleanup must confirm the exact child exited, the owned server closed,
and its temporary profile was removed.

Portable regressions exercise the actual store, fetch helper, reducer and
NoEngines component; only SSE and network responses are synthetic:

```sh
pnpm exec vitest run src/components/NoEngines.interaction.test.ts
pnpm typecheck
pnpm lint
pnpm i18n:check
```

For both layouts these tests also release a stale response after a timeout
and successful retry, verify it cannot restore old inventory, and verify an
explicit check joins a pending focus request while still reporting failure.
Every API request must be GET; checks cannot trigger sign-in, installation or
model discovery. This proves first-run inventory checks and recovery, not
live subscription authentication or inference.
