# Group delegation in the maintained CI suite

GrokOff runs these complete existing test files through pnpm test:core.
They provide a representative offline baseline for the roadmap's group
delegation workflow.

| File | What its fixture checks |
| --- | --- |
| server/room-handoffs.test.ts | Durable request trees, return/resume order, queued work, retry deduplication, pinned conversations, bounded depth/fan-out, scoped cancellation, lifetime limits and interruption without replay when the store reloads. Hooks and clocks are synthetic. |
| server/room-coordination.e2e.test.ts | Real HTTP routes and the injected agents MCP proxy with scripted provider subprocesses: same-room and nested dispatch, room destination continuity, approvals, peer/team boundaries, revocation, withheld results, busy recipients, cancellation, compact receipts and idempotent shared briefs. |
| server/room-recovery.e2e.test.ts | Stops its own fixture server, seeds a persisted interrupted routine, restarts that server in the same disposable data directory, verifies its new PID, and checks a single failure card in the source room plus idle status and safe recovery broadcasts. |
| src/lib/room-members.test.ts | Stable lead/roster ordering, additions and removals, and rejection of unavailable IDs. |
| src/lib/room-activity.test.ts | Handoff and opened-thread notices, failures and model/recovery notices stay visible when ordinary tool activity is hidden. These are pure renderer-helper checks. |

Run the selected set from the checkout:

    pnpm exec vitest run server/room-handoffs.test.ts server/room-coordination.e2e.test.ts server/room-recovery.e2e.test.ts src/lib/room-members.test.ts src/lib/room-activity.test.ts

All mutations use disposable fixtures. The shared launcher and restart
environment keep HOME, data, temporary files and provider discovery isolated;
only the repository's fake CLI is configured. Cleanup stops only owned
processes. The recovery file also bounds its health requests and verifies that
the new server owns the response before reading recovered state.

The scripted provider calls the actual coordination tools and records its
dispatch/result evidence. Its replies do not establish live-model planning,
generated artifact correctness, real account behavior or a native group-chat
workflow. Store reload checks and the owned HTTP restart cover their stated
interruption paths, not a packaged Mac restart. The renderer helpers do not
mount a chat window or click its handoff navigation.

Additional direct-chat, provider-retry and native UI recipes remain available
in the broader [coordination guide](room-coordination.md). They are separate
from this selected CI baseline.
