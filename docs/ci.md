<!-- GrokOff modification (2026-10-08): replace upstream CI and release instructions with the fork's actual checks. -->
# GrokOff source checks

GrokOff is a source Mac alpha. [CI](../.github/workflows/ci.yml) runs two Ubuntu
jobs on pull requests, pushes to `main`, and manual dispatch. It uses Node 24,
pnpm 10.33.0 and the committed lockfile. It does not build or publish a Mac
release, deploy hosted services, or authenticate to model providers.

The source job runs lint, translation validation, syntax checks using Electron's Node
runtime, the UI build (which also typechecks frontend and server sources),
`pnpm test:core`, and `pnpm test:packaged-server`. Any failed command fails the
job. The packaged-server smoke stages the bundled server outside the checkout,
uses temporary data and home directories, and checks startup, bundled workers,
MCP, backup export, and shutdown without provider inference.

The docs job separately generates route types, typechecks the docs app, and
builds its pages, search index and Open Graph images with Next.js. This keeps
docs dependency patches covered by their actual build. The inherited docs
content still describes OpenMausBot; this check does not publish that site.
The maintained attachment group runs complete composer intake, keyed draft,
private storage and upload-recovery files. It checks bounded held transport/body
failures, idempotent retry, no replay of permission/size refusals and real
Composer draft/Send recovery with synthetic transport. The
[attachment test map](verification/attachment-recovery.md) records its limits.

## Run the same checks locally

Use the Node version in [.nvmrc](../.nvmrc) and the pnpm version in
[package.json](../package.json). From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm i18n:check
pnpm check:electron
pnpm build
pnpm test
pnpm --filter @openmausbot/docs types:check
pnpm docs:build
```

`pnpm test` runs the maintained core suite and the bundled-server smoke. You
can run `pnpm test:core` alone while working on a relevant unit or renderer
change. Tests redirect their data into disposable homes; follow the
[verification guide](verification/README.md) for interactive mutation checks.
Do not aim those checks at your running personal workspace.

## Coverage and limits

`test:core` runs complete selected test files for configuration and request
authorization, Claude/Codex driver contracts and subscription billing guards,
Grok API behavior and model catalog, startup/default model selection, model
names and selection, pairing links, disabled analytics and hosted offers,
independent application identity, lazy phone-secret/cancellation behavior,
Markdown report previews and message-scoped file access, browser turn
cancellation, an isolated HTTP browser Stop integration, bounded browser
fixture teardown when a worker exits while a descendant retains its pipes,
and real Markdown math rendering with resource/trust regressions for the direct
and transitive KaTeX entry points. Mermaid math output and font/layout checks
use the separate disposable [math renderer fixture](verification/math-renderer.md).
Explicit provider checks also cover retained inventory on failure, bounded
inventory/model-discovery timeout and retry, concurrent startup and onboarding
checks, save/discovery overlap and confirmed sign-out state.
Memory coverage includes first edits before a bot has run, hash conflicts,
workspace containment, capture/recall and journal undo, plus explicit edits and
topic recall after an owned server restart. Memory model steps use scripted
fake replies; these checks do not establish model judgment or packaged UI behavior.
First-run local and remote fallback checks preserve setup inventory, report
explicit failures, unlock retries and keep completed focus failures quiet.
Offline disposable fixtures validate Mac CUA notice copying and packaged
source records.
It also adopts representative existing routine and webhook regressions:
scheduling/admission and saved receipts, queued/due startup recovery, fresh
execution/results continuity, delegation cancellation, cron tools and webhook
retry identities across process restart. Existing renderer checks cover run
status/report cards and historical results navigation. See the
[test map and fixture boundaries](verification/routines-ci.md).
Bot continuity coverage includes explicit setup, per-thread and bot-default
model scope, group dispatch and saved file locations, independent turn Stop,
and signed-out/missing-engine picker recovery. Picker handler checks use a
hook fixture; they do not drive a native account or operating-system menu.
The inert local-computer lease case runs on macOS and is skipped by Linux CI;
its descriptor stays in the disposable GrokOff home and starts no UI driver.
Representative group-delegation checks exercise scripted dispatch through the
real HTTP/MCP proxy, room and team access boundaries, approvals and revocation,
returned results, cancellation and interruption after an owned server restart.
Roster-order and activity-visibility helpers are included. The restart fixture
uses the shared isolated environment, seals provider discovery to the fake CLI,
and verifies the replacement server PID. See the
[test map and evidence limits](verification/room-ci.md).
Provider transports use fake CLIs or stubbed fetch responses. The exact file
list is in `package.json`; it is not the entire inherited test suite. The
inherited CI retry runner can retry only listed known flakes; the workflow
reports any retries in its job summary.

The original broad command remains available as `pnpm test:upstream` for
maintainer adoption work. It currently includes tests for excluded enterprise
source and removed upstream Docker/release workflows, and it is not the
contributor or PR gate. Adopt those fixtures deliberately when their features
enter the fork's supported scope; do not restore hosted deployment automation
merely to make historical workflow assertions pass. Broader conversation,
integration and desktop suites, plus additional routine fixtures, still need a
maintained fork baseline before CI can claim their coverage.

Portable CI does not prove macOS Accessibility or Screen Recording, voice,
real browser control, live provider account behavior, Intel Mac support, or a
clean native build on another contributor's Mac. Apple Silicon packaging is
manual with `pnpm package:grokoff`; it downloads pinned native helpers and
requires Xcode command-line tools. Its output is an unsigned local `.app`,
with publishing disabled. A GitHub source-check success is not native release
acceptance; retain the [verification evidence](../research/verification.md).

## Workflow maintenance

Workflow permissions are read-only, checkout does not retain its token, and
actions are pinned to reviewed commit SHAs. Pins were verified against the
official releases on 2026-10-08: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0),
and [pnpm action-setup v4.2.0](https://github.com/pnpm/action-setup/releases/tag/v4.2.0).
When updating a pin, confirm the tag's commit in the official repository.
`scripts/ci-workflow.test.ts` checks every workflow for privileged triggers,
write scopes, secret access, persistent checkout credentials, unreviewed
actions, and publishing commands. Repository branch protection and private
vulnerability reporting are separate GitHub settings; these files do not
enable them.
