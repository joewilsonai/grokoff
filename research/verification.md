# GrokOff first Mac build verification

October 8, 2026. Evidence distinguishes source checks, simulated integration,
observed UI and a public release. This is a locally built prototype.

This first-build record is historical. See the [October 9 integration verification](verification-2026-10-09.md) for the later unsigned candidate and its separate evidence boundaries.

## Artifact and provenance

- App: `release-grokoff/mac-arm64/GrokOff.app`
- Version: `0.1.0`; bundle identifier: `app.grokoff.desktop`; URL scheme: `grokoff`.
- Apple Silicon build, unsigned and not notarized. At the time of these first-build checks, no download site, public repository,
  automatic update feed or publication had been created.
- Apache-2.0 OpenMausBot community source pinned at
  `3e9e42b3a05e0b7c4edbaedba2e667b851296e27`. Enterprise code excluded;
  root and bundled third-party notices retained. See [UPSTREAM.md](../UPSTREAM.md).
- Separate app profile, `.grokoff` workspace, companion grants and native host identity.
  Existing application state and permissions are not migrated.
- Packaged main-process bytes match the final source; all 440 compiled server
  files match the built server. Package contents receipt (private local record).

## Completed checks

| Check | Result and evidence |
| --- | --- |
| TypeScript and production builds | `pnpm typecheck`, UI, server, companion and updater builds passed. |
| Changed test files | 666 passed, zero failed, one Linux-only skipped test across 36 files. Machine-readable result (private local record). |
| Native Node tests | 82 cloud/link/export/workspace tests and 27 startup/tray/server-supervisor tests passed. |
| Desktop startup fixture | Loading renderer, close-to-hide, mount wait, tray restore and quit checks passed. Receipt (private local record), capture (private local record). |
| Fake-engine conversation | Create, send, wait and message retrieval passed with an isolated fake Claude CLI. Receipt (private local record). |
| Restart persistence | Bot/channel recovery, durable queue cancellation and no replay of uncertain claims passed. Receipt (private local record). |
| Packaged runtime | Server booted outside the source tree; proxy entry points, MCP stdio, backup worker, child cleanup and bundled browser discovery passed. |
| Actual Mac app | Packaged app launched with independent temporary data, displayed its GO identity and bot roster, and served its owned server. App exit left no owned server. Receipt (private local record). |
| Packaged chat | A message sent through the native app produced `GrokOff fixture reply: native app chat works.`; the reply was visibly confirmed without Reload. Browser saved-state preparation passed. Receipt (private local record). |
| Locale and syntax | Ten locales with 3,704 strings validated; scoped lint and Electron module syntax checks passed. |
| Browser namespace and native runtime | 176 focused engine/runtime/live/native tests passed, including isolated restore/cleanup, private socket ownership, dotted-session cleanup and actual bundled engine preparation/MCP tool listing/close under a deliberately long temporary home. |
| Lazy phone identity and cancellation | 22 Node checks and 30 credential/phone Vitest checks passed. Fresh boot, concurrent creation, failed reads/writes, Stop and pairing cancellation were exercised with inert storage and sidecars. Receipt (private local record). |

The fake provider reports synthetic usage of $0.01. This is fixture data, not a
charge or a live inference call. The fake Bash tool event is also simulated;
it does not prove real command or browser automation.

## Review disposition

The required scoped `codex-review.sh --quick` review found two LOW UI mismatches
and no confirmed HIGH or MEDIUM findings. Both LOW findings were fixed:
disabled updates now have an explicit local-edition explanation, and the
nonfunctional analytics switch was replaced with a static disabled notice.
The affected renderer tests passed. Original review (private local record).

Additional independent source review found and corrected export-root, native host,
companion grant, CLI continuation and deep-link namespace collisions. Host desktop
control now starts disabled, including stale-descriptor cleanup; enabling it is an
explicit user action. Sessionless shared-service chat mutation routes are closed.
See [the security boundaries](../docs/design/fork-security.md).

The subsequent phone-key review (private local record) reproduced two MEDIUM
cancellation races. Stop during a pending key write and Close during a pending
pairing Open now invalidate that work. Independent review also reproduced stale
Stop terminating a newer Start; generation checks and a deferred-operation test
now protect that ordering. The browser review (private local record) found a
preexisting dotted-session cleanup regex that could match another profile's pending
save. Literal escaping and a cross-profile regression fixed it. All confirmed
findings in these scopes were addressed before packaging; this remains a scoped
review, not a whole-system security certification.

## First-launch Keychain finding

A test launch with a temporary `HOME` displayed macOS **Keychain Not Found** for
`GrokOff Key`. This workflow performed no reset. The dialog was absent on the next observation,
and the owned log recorded a failed encrypted phone-identity save while local startup
continued. Temporary app data does not create an independent macOS login Keychain.

Source inspection found eager creation of a phone-pairing identity on every fresh
packaged launch. Creation is now deferred to explicit companion use; an existing
encrypted identity can still be restored without rotation. Failed reads remain
protected, and a failed write cannot advertise an unpersisted private key.
The final fresh packaged launch opened without that prompt, created no
`credentials.bin`, and logged no phone-key save error. The app then sent and
displayed the simulated reply and quit normally with its owned server gone.
See the launch/shutdown receipt (private local record).
Native storage encryption must remain enabled; a mock or unavailable test store
does not prove production Keychain acceptance.

The first browser-namespace package also exposed macOS's 103-byte Unix socket
limit: the default namespaced path reached 105 bytes for a normal bot ID. GrokOff
now uses an owner-only short socket root under `/tmp`, keyed by home, UID and namespace, while
saved sessions remain in the separate home namespace. A real bundled-binary
regression and the final packaged chat passed after that correction. Overlong
profile/socket combinations fail before spawn with an actionable error.

## Remaining acceptance work

- Live provider authentication, real inference quality/cost and provider-specific tools.
- Real browser navigation and saved-login continuity, OS desktop control and permissions.
- Voice, external connectors, mobile pairing, real schedules and extended soak tests.
- Always-on cloud execution, full Grok Bot feature parity and workflow teaching.
- Developer signing, notarization, distributable installer and a public release.

Separate folders and approval controls are not an operating-system sandbox for
every provider process. This build requires an awake Mac for local work. Compilation
and isolated tests do not establish production safety or end-to-end parity.

## Publication note

This is a dated maintainer verification summary. Raw receipts, review transcripts,
account-specific metadata and screenshots remain in a private local archive and
are not distributed in the source repository. Historical local results do not
replace reproducible contributor checks or establish current provider availability.

## Routine regression adoption — October 9, 2026

The selected [routine and webhook CI group](../docs/verification/routines-ci.md)
passed on Node 24.21.0: 171 tests across nine existing files. It covers schedule
and admission rules, saved run receipts, queued/due restart recovery, fresh
execution/results threads, delegation cancellation, scripted cron tools,
webhook retry identities and historical result navigation. These files are
now included in the maintained `test:core` command.

Mutations ran only against disposable homes/files and exact loopback harness
listeners with the repository's fake Claude engine. Renderer checks used static
React markup and synthetic state. Raw logs and receipts remain private. This
adoption adds reproducible regression coverage; it does not establish live
provider schedules, external webhook delivery, execution across Mac sleep,
native calendar acceptance or a binary release.
