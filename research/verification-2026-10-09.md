# GrokOff integration verification — October 9, 2026

This dated maintainer record covers an unsigned Apple Silicon candidate and
isolated verification. The changes were combined locally while their GitHub
pull requests remained open. It is not a published binary, complete security
assessment or claim of Grok Bot feature parity.

The [first-build record](verification.md), [subscription verification](subscription-verification.md)
and [product comparison with its provenance](grok-dots-muse-comparison-2026-10-08.provenance.md)
remain historical evidence. The separate [October 8 browser/report record](https://github.com/joewilsonai/grokoff/blob/fd33b37d76fc6c759a93041ffc98c418b5560c3b/research/browser-report-2026-10-08.md)
describes the earlier bounded live Claude and Codex observations. No new live
provider call was made for the checks below.

## Candidate and change provenance

- Local candidate: `release-grokoff/overnight-2026-10-09/mac-arm64/GrokOff.app`.
- Local integration source: `6b5c2ed7ce37afa6d30dfdb36feb032837776d89`, with a clean
  working tree at packaging and integrity verification. This local combination
  was not pushed or merged into GitHub `main`.
- The app is unsigned and not notarized. Verification used owned temporary
  homes, data and processes; the existing user app and accounts were untouched.
- All 655 compiled UI/server/companion files and 96 Electron source files in
  the package matched the corresponding build/source bytes. The packaged
  browser inventory and rebuilt dormant updater were also checked. These
  comparisons establish this candidate's contents, not a reproducible native
  toolchain or a release certification.

Each of these open PR heads had passing required CI when checked for this record:

| PR | Change included in the local candidate | Verified head |
| --- | --- | --- |
| [#2](https://github.com/joewilsonai/grokoff/pull/2) | In-app Markdown reports and cancellation of accepted browser work | `fd33b37` |
| [#3](https://github.com/joewilsonai/grokoff/pull/3) | MCP schema URI parser patch | `caf1486` |
| [#4](https://github.com/joewilsonai/grokoff/pull/4) | Math renderer patch and unclipped diagram labels | `8d56dcf` |
| [#5](https://github.com/joewilsonai/grokoff/pull/5) | Docs runtime patches and separate docs CI | `c47acea` |
| [#6](https://github.com/joewilsonai/grokoff/pull/6) | Packaging dependency patches and updater regeneration | `a3f15dc` |
| [#7](https://github.com/joewilsonai/grokoff/pull/7) | Synthetic browser login restoration and bounded worker stream cleanup | `cd01e42` |
| [#8](https://github.com/joewilsonai/grokoff/pull/8) | Bounded provider checks, retry and response ordering | `3113d3f` |
| [#9](https://github.com/joewilsonai/grokoff/pull/9) | Visible first-run connection failures and retry | `9c1a492` |
| [#10](https://github.com/joewilsonai/grokoff/pull/10) | First memory edit and restart continuity | `c45bffc` |
| [#11](https://github.com/joewilsonai/grokoff/pull/11) | Mac CUA notices, corresponding source and packaging gate | `e79fac3` |

PR #7 depends on #2; #9 depends on #8. Passing CI for each PR is separate from
the local combined checks below. None of these records imply a GitHub merge.

## Combined source and packaging checks

| Check | Observed result |
| --- | --- |
| Maintained combined tests, Node 24 | 48 Vitest files passed: 1,367 tests passed and one intentional skip. All 34 Node tests passed. |
| Builds | UI, server, companion and updater builds passed; native speech and the owned arm64 CUA preparation completed. |
| Lint, locales and Electron syntax | Lint passed with warnings denied; ten locale catalogs validated against 3,721 English strings; 158 Electron modules passed syntax checks. Catalog validation does not mean every translation is complete. |
| Isolated bundled-server smoke | The built server started without reachable `node_modules`; all 13 spawned proxy paths resolved; MCP stdio flushed final frames; the backup worker exported an encrypted archive; the container launcher stopped its owned child; the desktop entry started twice through its compile cache. |
| Actual Mac packaging notice gate | Both `afterPack` and the read-only packaged-resource verifier passed on this app. Exact native NOTICE, pinned source/license records, bundle banner and resolver patch source were present. |

The package was built without publishing. Scoped production and fixture reviews,
their corrections, dependency changes and branch-specific validation are recorded
in the linked PRs. These are bounded checks, not a whole-system audit.

After this candidate was built, [PR #12](https://github.com/joewilsonai/grokoff/pull/12)
adopted nine existing routine, webhook and renderer regression files into the
maintained source command. Its exact head `20c9d97` passed required CI with 30
files, 1,058 tests passed, one intentional skip and all 11 Node checks; the
selected adoption group passed 171 tests. This test/documentation change did
not rebuild or alter the candidate above. The [routine test map](https://github.com/joewilsonai/grokoff/blob/20c9d97f8d97ab9c9188b1fc716e03761e5a8031/docs/verification/routines-ci.md)
distinguishes disposable server/fake-engine checks and static renderer checks
from live scheduling, external webhook delivery or native calendar acceptance.

[PR #13](https://github.com/joewilsonai/grokoff/pull/13) subsequently corrected
the disposable Mac independent-thread lease fixture's folder/host identity and
adopted six existing bot-continuity and model-picker handler test files. Its
head `81d908f` passed required Linux CI with 27 files, 941 tests passed, two
intentional platform skips and all 11 Node checks. The local Mac suite passed
942 tests and one skip, including the Mac-only lease case that Linux skips.
This was another test/documentation change; it did not change the candidate's
runtime. Handler checks bypass UI effects/layout and use synthetic engine state.

## Browser, report and restart observations

Two different executions establish different boundaries:

| Execution | What passed | Limit |
| --- | --- | --- |
| Actual packaged app | The app bootstrapped its owned bundled server and bundled renderer, opened a persisted report, and fetched its exact saved bytes through the desktop-authenticated message-file route. Owned app/server processes exited and temporary data was removed. | The source fixture seeded persisted data before launch. Report/provider behavior was deterministic; this was not a live research task inside the packaged app. Existing smoke mode suppressed URL-handler registration. |
| Packaged browser assets with the real source Electron renderer | The `agent-browser` and Chrome executables inside this new app read two fresh loopback pages and matched their random observation marker. The real renderer/preload displayed the report and two citation targets, downloaded matching bytes, stayed within a 390-pixel viewport, and exercised Allow once, Deny and denial on Stop. A fresh owned server and Electron process restored the same message IDs and report hash. Exact owned native/browser, desktop and server cleanup passed. | Provider events, report composition and approval requests were scripted. This recipe uses the source Electron entry, not the packaged app bootstrap. External citation activation and live model reasoning are not proved. |

The new candidate's browser executable hashes matched its packaged manifest:
`agent-browser` 0.37.0 and Chrome headless shell 153.0.8010.47. Contributors can
repeat the [browser/report recipe at the reviewed PR #2 head](https://github.com/joewilsonai/grokoff/blob/fd33b37d76fc6c759a93041ffc98c418b5560c3b/docs/verification/browser-report.md),
selecting the executables inside their own candidate through the documented
`OMB_VERIFY_BROWSER_BINARY` and `OMB_VERIFY_BROWSER_CHROME` variables.

Separately, the [saved-login recipe at the reviewed PR #7 head](https://github.com/joewilsonai/grokoff/blob/cd01e42d6c37da9b8c73f1beab9b47c641c34013/docs/verification/browser-login.md)
passed with an actual native helper and a synthetic loopback login. It proved
cookie and local storage restoration after closing the exact owned session,
confirming its daemon was absent and starting fresh runtime/helper processes.
An isolated guest profile remained unauthenticated; saved state used a random
fixture-only encryption key. This is a source fixture result, not a packaged
app login to a real website or proof of macOS Keychain acceptance.

## Packaged memory editor and restart

A separate disposable fixture launched the actual candidate's unmodified
main process, preload, bundled renderer and embedded server. An absent
`MEMORY.md` opened as empty in the real editor. Saving through the real UI
persisted the exact synthetic preference at mode `0600` and created its
person/UI journal entry.

A second owned app and embedded-server process reopened the same fixture
data. The editor and journal restored. A fresh thread created through the UI
sent a synthetic prompt from the composer; the launched fake Claude CLI's
actual system prompt contained the saved preference, and its scripted reply
appeared in the conversation. All exact owned app, server and CLI processes
were subsequently absent, and fixture homes/profiles/data were removed. The
candidate's `app.asar` and executable hashes remained unchanged.

This observes packaged UI, persistence and prompt delivery. The provider was
synthetic, background upkeep was disabled, and source setup seeded only
configuration before the native launches. It does not prove live account
authentication or a real model's memory quality. The [public memory recipe at
the reviewed PR #10 head](https://github.com/joewilsonai/grokoff/blob/c45bffc93862607e3ff41be0f34ac2f8909fbfb9/docs/verification/memory-layer.md)
provides reproducible source-server first-edit, correction, journal, recall
and restart checks; that source recipe does not itself launch the packaged
memory editor. Protocol registration remained suppressed for the owned app
launches.

## Remaining acceptance and release requirements

- A full task combining a live provider, packaged desktop navigation, report
  production and restart still needs acceptance. The earlier bounded CLI/server
  subscription evidence does not complete that milestone or establish research
  quality, future model availability or unlimited subscription usage.
- Real website authentication, OS desktop permissions/control, live schedules,
  external connectors, voice and extended soak behavior remain separate work.
- The Mac notice correction supplies pinned source and notice records. The
  complete native SBOM, exact embedded dependency inventory and native binary
  reproduction remain pending. See the [Mac notice verification recipe](https://github.com/joewilsonai/grokoff/blob/e79fac31945c23ec3f713307c7714a16ed472f9d/docs/verification/mac-cua-notices.md).
- Two dependency scanner findings remained in the combined build-tooling graph:
  high severity `http-cache-semantics` and moderate severity `sprintf-js`.
  They were not dismissed. The downloader migration and its proxy, timeout,
  cache and integrity behavior need a separately verified change; no complete
  security clearance or runtime exploitability claim follows from this scan.
- Clean-install/update acceptance, remaining upstream branding inventory,
  developer signing, notarization and a distributable public release remain
  pending. The local candidate is not an installer or release download.

The public [isolated verification instructions](../docs/verification/README.md)
require disposable data and exact owned cleanup. Raw receipts, screenshots,
account information and temporary paths remain private. This record summarizes
maintainer observations; repeat the relevant checks against any later source or
candidate rather than treating these dated results as current acceptance.
