# GrokOff implementation plan — October 9, 2026

GrokOff should make one complete task dependable: give a standing bot a research
request, observe its work, handle requests for input, and receive a useful report
that remains available after a restart. The preserved [product research](../../research/product-research.md)
and [three-product comparison](../../research/grok-dots-muse-comparison-2026-10-08.md)
inform this direction. Their documented capabilities are design inputs, not
performance benchmarks or claims of feature parity.

The current foundation is the OpenMausBot community edition with an independent
Mac alpha. Keep that working foundation, its attribution and existing data
contracts. Claude and Codex subscription connections remain supported; model
and effort labels use the providers' canonical terminology.

## Immediate implementation

| Unit | User outcome | Acceptance |
| --- | --- | --- |
| Combined review branch | One source checkout contains the existing browser, provider, memory and setup work. | Required source checks and combined tests pass; the separate local app has a pinned source and integrity record. Individual PRs stay available for review. |
| Report loading recovery | A stalled report exposes a clear failure and manual Retry instead of waiting indefinitely. | A total fetch/body deadline; real component controls for held headers/body, dismissal, retry and stale responses; existing authorization and size limits retained. |
| Local PDF export | A completed report can be saved as a readable PDF from its conversation. | Export the current loaded report through an isolated Electron print window; deny remote resources and unrelated content; bound time and cleanup; inspect a disposable multipage PDF. |
| First-run wording | Welcome examples consistently describe an assistant in the GrokOff app. | Change only the visible sample labels; existing onboarding/scene regressions and source checks pass. Preserve internal identifiers and actual user bot names. |

Each unit gets a small open PR, the repository's scoped review, relevant tests,
a redacted publication scan and fresh CI. Source tests, packaged desktop checks
and live-provider acceptance are recorded separately. Local builds do not
restart the user's installed app or alter its accounts and conversations.

## Next evidence gate

After these units pass, reassess the browser-to-report milestone using the
[verification recipes](../verification/README.md). The remaining complete
packaged workflow must exercise a live provider, browser navigation, approvals,
Stop, the finished report and restart persistence. Existing deterministic
fixtures and bounded prior provider runs prove narrower behaviors. Do not
repeat external actions just to manufacture a passing receipt.

Then prioritize a concrete failure or missing user outcome in memory, routine
results or specialist handoffs. The existing foundation already has these
concepts; improve verified continuity and ownership before adding another
parallel system. A new feature must have a specific user task and an observable
acceptance condition.

## Release and later scope

Native credential encryption, complete component notices/SBOM, reproducible
native build provenance, remaining branding and clean install/update need
separate acceptance. Signing, notarization and binary publishing require a
project-owned release process. Unresolved dependency advisories remain visible.

Remote workers, mobile clients, hosted multi-user execution, voice expansion and
new paid integrations remain later candidates. They add infrastructure, account
and cost requirements. The local Mac alpha requires the Mac to remain powered
and awake; documentation and UI must reflect that limitation.
