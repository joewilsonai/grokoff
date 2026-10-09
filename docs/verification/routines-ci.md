# Maintained routine and webhook regressions

These existing tests are included in GrokOff's `test:core` and run in source CI
on Node 24. They cover representative routine paths through the real scheduler
and isolated harness, plus focused renderer behavior.

| Existing test file | Coverage |
| --- | --- |
| `server/routines.test.ts` | Schedule validation, queue/overlap admission, saved run receipts, cancellation, failures and previous-report continuity. |
| `server/routines-startup.test.ts` | Queued/due work resumes after restart while interrupted work and its stale delegations stay stopped. |
| `server/routine-results.e2e.test.ts` | Fresh execution threads, persistent results destinations, approval/deletion handling and unread state through a disposable server. |
| `server/routine-delegation.e2e.test.ts` | A routine waits for its busy peer, resumes after replies or denial, and cannot revive cancelled work. |
| `server/routine-cron.e2e.test.ts` | Scripted calls through the real routine tools preserve expressions/zones, apply changes and reject invalid or duplicate schedules. |
| `server/webhook-idempotency.test.ts` | Delivery identities survive disk failures and run-history pruning; retry windows and capacity cannot duplicate unfinished work. |
| `server/webhook-restart.e2e.test.ts` | A delivery retries without a second execution after a disposable child exits between queue and ingress commits. |
| `src/components/RoutineRunCard.test.ts` | Dated reports, deferred/failed/waiting status, explicit input requests and availability of the execution link. |
| `src/components/RoutineResultsNavigation.test.ts` | Historical results open their recorded bot/group conversation and avoid deleted destinations. |

Run the selected group directly, or run the complete maintained gate:

```sh
pnpm exec vitest run server/routines.test.ts server/routines-startup.test.ts server/routine-results.e2e.test.ts server/routine-delegation.e2e.test.ts server/routine-cron.e2e.test.ts server/webhook-idempotency.test.ts server/webhook-restart.e2e.test.ts src/components/RoutineRunCard.test.ts src/components/RoutineResultsNavigation.test.ts
pnpm test:core
```

Mutation fixtures create temporary homes/data and dynamically allocated
loopback listeners using `launchVerificationServer()`. They install only the
repository's fake Claude engine; scripted cron calls use a predetermined tool
plan. Restart tests reuse that exact disposable home, restrict their child
environment and stop the owned children in cleanup. Unit tests use temporary
files and synthetic clocks/callbacks. Renderer tests use static React markup
and captured dispatches, with synthetic run/account state; they start no
provider or native app.

These checks do not establish live provider execution, unattended Mac schedules
across sleep, external webhook delivery, long-running reliability or native
calendar UI acceptance. The larger inherited routine suite remains outside
this selected CI group. For the separate disposable interactive recipe, use
[the routines fixture](routines.md); open its printed preview URL, never the
personal app. Keep raw fixture logs and receipts private.
