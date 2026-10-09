# Browser research and readable reports

GrokOff can open a shared `.md` report inside the conversation. The book button
beside a report link or attachment opens headings, tables, code and web source
links; Download keeps a copy. Escape closes the reader and restores focus.

The reader uses the original message's file grant. Report contents cannot grant
access to additional local files, execute HTML, or automatically fetch images.
Previews accept UTF-8 Markdown/plain text up to 1 MiB, including streamed
responses. Larger files can still be downloaded.

Stop now cancels browser work already dispatched by the stopped turn, closes
that browser session, and blocks further actions until explicit recovery.
Saved profile files are retained. An action already accepted by a website
cannot be undone: after recovery, check what happened before repeating it.

## Repeatable Mac desktop check

Install dependencies and prepare the native browser with `pnpm build:browser`.
Then, from the repository root on Apple Silicon:

```sh
OMB_VERIFY_BROWSER_BINARY="$PWD/dist-native/browser/darwin-arm64/agent-browser" \
OMB_VERIFY_BROWSER_CHROME="$PWD/dist-native/browser/darwin-arm64/chrome/chrome-headless-shell-mac-arm64/chrome-headless-shell" \
node --experimental-strip-types scripts/verify-browser-report.ts
```

The fixture owns a temporary server, browser home, Electron profile and download
folder. It never discovers or mutates a running personal workspace. Receipts,
screenshots and logs are kept under ignored `.local/browser-report-*` folders.

The check:

- Reads two loopback pages containing fresh random markers using the native
  browser, then constructs a deterministic report from those observations.
- Mounts the real App and production preload in an isolated Electron window.
- Opens the report, checks its facts and citation targets, downloads the same
  bytes, and checks narrow-window layout.
- Sends a turn from the composer, exercises Allow once and Deny through the
  real approval broker, and verifies Stop denies a pending request.
- Restarts the owned server and Electron process, verifies persisted message
  identity and report bytes, and opens/downloads the report again.

Provider narration, report composition and permission requests in this recipe
are scripted. Optional desktop IPC is inert. The recipe does not establish live
model research quality, activation of external citation links, saved website
login continuity, or the complete packaged-app startup path.

## Regression checks

`pnpm test:core` includes report rendering/file boundaries, bounded previews,
browser turn cancellation, and a real isolated HTTP Stop test with a delayed
synthetic browser. The Stop test checks revoked credentials, the exact session
close, blocking a replacement turn and explicit recovery. No provider account
or native browser download is required for these portable tests.

Live-provider observations and their limits are recorded separately in
[the dated acceptance record](../../research/browser-report-2026-10-08.md).
