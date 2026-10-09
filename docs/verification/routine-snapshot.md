# Routine snapshot hydration recovery

The optional `/api/routines` snapshot has one 30-second deadline for response
headers and complete JSON decoding. A stalled or invalid snapshot keeps the
last known routines/results, enters the existing load-error/backoff path, and
releases queued chat and routine frames once the other snapshots finish.
Scheduler execution limits and the general command API are unchanged.

```sh
pnpm exec vitest run src/state/routine-snapshot.interaction.test.ts src/state/store.test.ts
```

The complete interaction file is maintained in `test:core`. It mounts the real
StoreProvider with a sealed synthetic fetch allowlist and in-memory EventSource.
Virtual clocks exercise held headers, delayed headers plus a held streaming JSON
body, transport abort, queued ordinary replies and completed runs, failed
reconnects with retained history, and a retry overtaken by a newer live result.
HTTP refusal, malformed/missing JSON envelopes, normal success, late ignored
responses and quiet unmount are checked through the same store.

These are source-state regressions. They do not open a browser, run native
Electron, perform a real HTTP/server restart, dispatch scheduled work, measure
wall-clock latency or call a provider. The existing [routine verification
recipe](routines.md) covers the separate scheduler and renderer workflows.
