# Subscription connections — October 8, 2026

## Applied

The Claude Code and Codex adapters now require recognized subscription
authentication on their default routes. They check again before executing tasks.
API and custom provider access remains an explicit choice. Account repair uses
the official login flows, and Settings shows the confirmed billing mode.

Neither provider's credential store nor the user's live GrokOff profile was
modified during verification. No live Claude or Codex task was submitted.

## Verified

- Codex identity/device-auth/driver suites: 284 passed.
- Claude subscription/auth/account/login/driver suites: 231 passed, 1 existing
  skipped. After the routing fix, all affected subscription/account/turn suites
  were rerun: 207 passed, 1 existing skipped; TypeScript and scoped lint passed.
- Engine library/setup/settings and preview suites: 58 passed.
- Account/settings/sign-in supplemental suites: 51 cases passed after updating
  the synthetic Claude HTTP fixture to include subscription metadata.
- Full app TypeScript check, scoped UI lint and locale validation passed.
- The actual Settings renderer showed subscription billing and account limits
  in an isolated preview. Its server, temporary data and browser tab were closed.
- `pnpm package:grokoff` rebuilt the arm64 Mac app successfully. After the review
  fix, the server was rebuilt and the app was repackaged successfully.
- The packaged-server smoke check passed startup without repository dependencies,
  all 13 proxy paths, MCP shutdown frames, encrypted backup export, container
  lifecycle and desktop-entry restart with the compile cache.
- The packaged `Resources/server/index.js` matches the built server SHA-256:
  `e31be2cf8b5300f6a99853acc3e88efb576a7cf7dbc769380921ac5abd40a4b2`.

The required scoped `codex-review.sh` review found no HIGH issues and one MEDIUM
local-model routing regression. The guard was moved after confirmed injection
resolution. An independent review passed the corrected ordering and eight
focused regressions: signed-out local routing succeeds, while unresolved models
and unknown/API/Console cloud authentication remain blocked. The original
review output (private local record) is retained with its finding.

Initial checks established subscription metadata through the official CLIs.
One provider still needed sign-in at that stage; the later acceptance below
supersedes that initial readiness state.

The synthetic settings screenshot is retained in the private local verification archive.

## Remaining acceptance

Claude needs an official Claude Code account sign-in before a live task can be
accepted. A real inference/tool-use workflow with both providers is still
unverified. The local Mac build remains unsigned and unnotarized.

Connection instructions and current provider sources are in
[subscription connections](../docs/subscription-connections.md).

## Follow-up: connected accounts and live acceptance

After official provider sign-in, the live app and CLIs confirmed recognized
subscription authentication for both providers.
Both subsequently passed real inference plus a fixed local file-read task
through an isolated GrokOff server: Claude Sonnet 5.5 / Medium and Codex
GPT-6-Astra / Medium. Exact assistant/tool receipts, usage, the interrupted
Claude test-runner attempt and cleanup are recorded in
[live subscription acceptance](subscription-live-acceptance.md).

The Codex check exposed an inherited inline MCP declaration the existing
scanner did not recognize. The scanner now covers that valid configuration
form. Native metadata confirmed all twelve ambient entries disabled before
the selected fixture tool was mounted; the strict confirmation guard remains
in place. User configuration and sign-in were not changed.

Provider terminology and model-specific effort support were also corrected;
see [model name verification](model-names-verification.md). The older
signed-out state and packaged hash above describe the initial checkpoint.

## Publication note

This is a dated maintainer verification summary. Raw receipts, review transcripts,
account-specific metadata and screenshots remain in a private local archive and
are not distributed in the source repository. Historical local results do not
replace reproducible contributor checks or establish current provider availability.
