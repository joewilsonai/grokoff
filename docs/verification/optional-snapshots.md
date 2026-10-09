# Optional config and webhook snapshot recovery

The initial/non-resumable reconnect boundary reads optional configuration and
webhook panels alongside the chat snapshot. Each of these two optional reads
has one 30-second deadline across headers and JSON decoding. Timeout, malformed
envelope or HTTP failure reaches the existing warning/backoff lane without
erasing prior settings or webhook history; queued ordinary chat and routine
updates are released once the other boundary reads settle. Unmount aborts these
reads quietly. General command APIs, scheduled execution, instance checks and
the separate routine snapshot reader are unchanged by this unit.

```sh
pnpm exec vitest run src/state/optional-snapshots.interaction.test.ts src/state/store.test.ts
```

The complete interaction file is maintained in `test:core`. It mounts the actual
StoreProvider with a sealed synthetic fetch allowlist and in-memory EventSource.
Both endpoints are checked with held headers and delayed headers plus a held
streaming JSON body, followed by transport abort, queued reply/bot/run recovery,
retry and an ignored late response. Reconnect cases retain prior state and
prevent a stale background retry from replacing a newer live patch. HTTP/JSON
failures, successful timer cleanup and quiet unmount use the same store.

Configuration validation checks its object envelope and refuses error bodies,
without introducing a new settings-section schema. Webhook validation checks
its arrays and ingress envelope; omitted attempts still default to an empty
list. Invalid snapshots cannot clear existing panel state. The server remains
responsible for individual record schemas.

These source-state regressions use virtual clocks, rather than measuring real
wall-clock latency or a network socket. They launch no native app/browser,
real server, scheduler or provider and do not use user data or credentials.
