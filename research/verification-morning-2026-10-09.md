# GrokOff morning verification — October 9, 2026

This supplement records the later combined source and unsigned Apple
Silicon build. The combined source is available on the dedicated
[combined draft PR #32](https://github.com/joewilsonai/grokoff/pull/32). Individual pull requests remain
open for maintainer review; GitHub main remains unchanged. The [earlier October 9 record](verification-2026-10-09.md)
remains unchanged and describes its older `6b5c2ed` candidate. The preserved
[product comparison and provenance](grok-dots-muse-comparison-2026-10-08.provenance.md)
remain research inputs, with their original evidence limits.

## Candidate and checks

The new candidate was built from clean local source
`9eaea1df8c22226ed5b08b10ba976f8e9d0a0ba2`, including the 30 PR heads below.
Its local path is `release-grokoff/overnight-reviewed-2026-10-09/mac-arm64/GrokOff.app`.
It is unsigned, not notarized and not a published binary or installer.
Later documentation updates to PR #14 are separate from this build's source.

| Check | Measured result |
| --- | --- |
| Combined maintained suite, Node 24 | 95 Vitest files passed: 2,148 tests passed and one intentional skip. All 87 Node tests passed. |
| Builds/types, lint and catalogs | UI/server types and builds, lint, ten catalogs against 3,722 English strings and syntax checks for 158 Electron modules passed. Catalog validation does not mean complete translations. |
| Bundled server | All six smoke groups passed: isolated startup, all 13 proxy paths, flushed MCP frames, encrypted backup worker, owned container child cleanup and repeated desktop compile-cache startup. |
| Candidate integrity | All 773 regular resource files, 655 compiled UI/server/companion files and 96 archived Electron source files matched their corresponding build/source bytes. Browser inventory, dormant updater and actual packaging notice gates passed. |
| Preceding `8942949` native branding helper checks | All 32 Node tests passed, with one intentional Windows-only skip; all 58 diagnostics Vitest tests passed. These complete existing helper files cover compatibility/ownership/redaction as well as the changed branding expectations. |

All recorded heads had passing required CI and were ancestors of the build
when checked. Individual PR CI and the combined local suite are separate
results. PR #14's row pins the historical record included at packaging; this
supplement's later commit is not part of the packaged runtime. Corrections to
PRs #11, #15, #21 and #31 passed fresh checks. The local merge preserved the
combined test inventory and all 13 CUA source-record rows. Review conversations
remain separate from passing CI and require maintainer triage before merging.

| PR / scope | Source head | Exact-head CI |
| --- | --- | --- |
| [#2](https://github.com/joewilsonai/grokoff/pull/2) Browser/report recovery | `fd33b37d76fc6c759a93041ffc98c418b5560c3b` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37887834213) |
| [#3](https://github.com/joewilsonai/grokoff/pull/3) URI parser patch | `caf1486a74513b4336f3fdd5092e337627ea10bb` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37888420388) |
| [#4](https://github.com/joewilsonai/grokoff/pull/4) Math rendering | `8d56dcf66a96ef05acb10749762411c5313dc1d8` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37892542307) |
| [#5](https://github.com/joewilsonai/grokoff/pull/5) Docs dependencies/CI | `c47acea239c3982b78b215caa2027a2500de0880` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37894011121) |
| [#6](https://github.com/joewilsonai/grokoff/pull/6) Packaging dependency patches | `a3f15dc35c90d77dddb95a31371881a2085eeb95` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37894652554) |
| [#7](https://github.com/joewilsonai/grokoff/pull/7) Synthetic browser restoration | `cd01e42d6c37da9b8c73f1beab9b47c641c34013` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37896477916) |
| [#8](https://github.com/joewilsonai/grokoff/pull/8) Provider inventory recovery | `3113d3ff678fda7dd880d8b779ad655bb01ea902` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37898281099) |
| [#9](https://github.com/joewilsonai/grokoff/pull/9) First-run refresh errors | `9c1a49296f1731a2d90a08b82b98299bdb84e720` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37899296255) |
| [#10](https://github.com/joewilsonai/grokoff/pull/10) Memory first edit/restart | `c45bffc93862607e3ff41be0f34ac2f8909fbfb9` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37899365255) |
| [#11](https://github.com/joewilsonai/grokoff/pull/11) Mac CUA notices | `4824f74f6fdb190d152624f9e8128e049e93bb6e` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37930372827) |
| [#12](https://github.com/joewilsonai/grokoff/pull/12) Routine regressions | `20c9d97f8d97ab9c9188b1fc716e03761e5a8031` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37900784047) |
| [#13](https://github.com/joewilsonai/grokoff/pull/13) Continuity/model-picker regressions | `81d908f62e407a9705d08b9491c6f39469c9f23a` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37902081978) |
| [#14](https://github.com/joewilsonai/grokoff/pull/14) Historical verification record | `b566e79d1720352614a719df7f7cfa6b72fcc206` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37903093312) |
| [#15](https://github.com/joewilsonai/grokoff/pull/15) Group delegation regressions | `e4ca69aca1820a54aff508c935005be4e5b5fedc` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37930711315) |
| [#16](https://github.com/joewilsonai/grokoff/pull/16) Routine source UI lifecycle | `229137f2e8b0742b26a1134b15a42163b4412a32` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37904166456) |
| [#17](https://github.com/joewilsonai/grokoff/pull/17) Electron archive notices | `11a46f736bcdc2f1502b456e343b0dac63866ca4` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37904452608) |
| [#18](https://github.com/joewilsonai/grokoff/pull/18) Observed native crate notices | `8533914df2c082ff4e359ca282d27ae80a7bcf67` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37906305024) |
| [#19](https://github.com/joewilsonai/grokoff/pull/19) Upload deadline/retry | `bd8fed151ea9f94506498fa39451f6ea9f8582d3` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37906699327) |
| [#20](https://github.com/joewilsonai/grokoff/pull/20) API-key probe recovery | `ea688742d95d51c46e9d3b9d886f6a4bdadc3874` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37919702399) |
| [#21](https://github.com/joewilsonai/grokoff/pull/21) Workspace export/restore | `cdf2a76163cdc8ec104c4f98b397beb7bf5faf5a` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37930307147) |
| [#22](https://github.com/joewilsonai/grokoff/pull/22) Claude completion recovery | `513a819a236e14b700a0a7f118747775226946e7` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37912143707) |
| [#23](https://github.com/joewilsonai/grokoff/pull/23) Credential helper regressions | `5ae41def9b27c5f0e429dd1481e20417b3c35f7c` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37912654191) |
| [#24](https://github.com/joewilsonai/grokoff/pull/24) Device completion recovery | `381b4b01a206bef1c0d423d3423ebf825bc9800c` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37913775063) |
| [#25](https://github.com/joewilsonai/grokoff/pull/25) ModelPicker mock compatibility | `ec17b9bb87f8a06e7b003fa4c19a1b78919bbb2f` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37916449760) |
| [#26](https://github.com/joewilsonai/grokoff/pull/26) Observed JavaScript notices | `5472dc89f61bb77428195f30bf1dce5d4eff2849` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37918196855) |
| [#27](https://github.com/joewilsonai/grokoff/pull/27) Fresh welcome restoration | `c74cdc947346a680e412632c011ef75948b610c3` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37918503357) |
| [#28](https://github.com/joewilsonai/grokoff/pull/28) Lucide/Mermaid notices | `447ae99fc5a5af456cf87cc17fb3068c98d3b9b7` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37921391991) |
| [#29](https://github.com/joewilsonai/grokoff/pull/29) Tour pause/resume in Settings | `bda8b7da858f2e368cdb399dc1f3e36ca7e474bb` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37922493511) |
| [#30](https://github.com/joewilsonai/grokoff/pull/30) Native diagnostic branding | `e49b626d9abcabd78b0bbd7bbd862fb5b4582592` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37926654933) |
| [#31](https://github.com/joewilsonai/grokoff/pull/31) Server error branding | `c96bb71bb496d54f9962188d22b6db8b87115ad6` | [PASS](https://github.com/joewilsonai/grokoff/actions/runs/37930418435) |


## Desktop observations and their limits

Checks used disposable homes, profiles, configuration and exact owned
processes. The existing user app and accounts were untouched. Provider events
were synthetic; no new live provider inference or paid API/media call was made.

The preceding `8942949f47b561b2861d733e10aa8f30cca209b4` candidate
was the app actually exercised in the following native checks. Its executable,
app archive, all 655 compiled files and all 96 Electron source files match the
new `9eaea1d` build byte for byte. Only three retained CUA source-record resources
changed in the new package. This comparison does not turn earlier observations
into fresh execution on the new candidate.

On that `8942949` candidate, the unchanged packaged first-run fixture passed a fresh optional blank-name welcome, real Continue, welcome/guided Skip and persisted completion. Distinct app and embedded-server processes restarted the same disposable workspace; clearing only owned browser storage and performing a new-document configuration reload kept onboarding dismissed. All 13 recorded processes were independently absent, the temporary home/data were removed and all 773 resource hashes and the executable remained unchanged.

A visible provider/report fixture on `8942949` paused the tour while Settings
was open and resumed the same step on close. The production 30-second model
discovery deadline fired at 30,016ms while the renderer remained alive. An
unobscured warning survived Settings remount; manual retry performed discovery
without starting authentication again (auth start/status/model requests: 1/1/2),
retained the baseline account/model and displayed the returned model. The saved
report opened visibly and its download endpoint returned the exact 179 bytes.
All nine owned processes were independently absent after cleanup, temporary
data were removed and package bytes remained unchanged. This synthetic run does
not prove real authentication, a native save picker or provider inference.

The preceding `3c1ce2a` candidate separately passed actual packaged blank-name
welcome/Continue/Skip persistence, distinct app/server restart and a new-document
reload. A visible provider fixture paused the tour while Settings was open,
resumed the same step on close and observed the production 30-second discovery
deadline at 30,421ms. The warning survived Settings remount; retry performed
model discovery without another auth start (start/status/models: 1/1/2),
retained the account/baseline model and displayed the returned model. Its report
endpoint returned the exact 179 saved bytes. These are observations on that
specific preceding app, separate from any final-candidate check above.

The actual `8942949` memory fixture created a synthetic note through the visible
editor and Save button. The file had mode 0600; its sole journal entry identified
a person/UI change and remained the same after a distinct app/server restart.
A fresh thread sent a prompt through the real composer; the owned fake CLI
received the saved marker in its actual system prompt, and the exact persisted
bot reply was visible in the active conversation. All 26 owned processes were
independently absent, temporary data were removed and package bytes remained
unchanged. Two earlier fixture attempts failed before Save; their seed/focus
corrections were reviewed and retained with the failed evidence. This establishes
bounded storage, prompt and restart continuity, not useful semantic recall, live
provider quality, OS-wide Keychain behavior or encryption acceptance.

Other source fixtures established narrower workflows: owned encrypted workspace
export/restore and fake-CLI continuation; real source Electron upload recovery
at the production 90-second transport/body deadlines; source Claude/device sign-in
completion, API-key probe recovery and stale-response ordering. They do not
prove a packaged file picker, real authentication, provider entitlement,
research quality or OS desktop permissions. Credential helper coverage uses
pure objects/callbacks, not macOS safeStorage or Keychain. The reported native
Keychain problem still needs explicit encryption acceptance.

## Dependency and release requirements

The restored dependency graph retained two tooling findings: high severity
`http-cache-semantics` and moderate `sprintf-js`; the production-only audit
reported zero findings. The build-tool advisories remain unresolved and were
not dismissed or assigned an unverified fix. A compatible stable downloader
migration was not established. Primary records:
[HTTP cache advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) and
[sprintf advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
This scanner result is not a security clearance or evidence of a runtime exploit.

The app preserves exact Electron/Chromium and pinned CUA notices and source
records. The observed JavaScript gate covers React/ReactDOM 19.2.8, Ajv 8.20.0,
Croner 10.0.1, electron-updater 6.8.9, lucide-react 0.539.0 and Mermaid 12.1.0:
seven directly observed components with six original notice texts. The updater
remains disabled. This is a partial inventory; full JavaScript/native transitive
notices, native SBOM and reproducible native build provenance remain pending.

Remaining acceptance includes a complete live-provider packaged browser/report
workflow, real website login, native encryption, OS control, live scheduling,
extended soak and model/memory quality. Remaining upstream welcome/trigger/computer
copy and mascot branding need a separate bounded pass. Signing, notarization,
clean install/update and binary release are also pending.

The [isolated verification guide](../docs/verification/README.md) requires
owned disposable data and exact cleanup. Raw receipts, screenshots, account
information and temporary paths remain private; this public record summarizes
measured maintainer observations.
