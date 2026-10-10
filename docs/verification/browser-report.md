# Browser research and readable reports

GrokOff can open a shared `.md` report inside the conversation. The book button
beside a report link or attachment opens headings, tables, code and web source
links; Download keeps a copy. The local Mac app can also [save the loaded report
as PDF](report-pdf.md). Escape closes the reader and restores focus when its
opener is still mounted.

The reader uses the original message's file grant. Report contents cannot grant
access to additional local files, execute HTML, or automatically fetch images.
Previews accept UTF-8 Markdown/plain text up to 1 MiB, including streamed
responses. A preview attempt has a 30-second deadline across its request and
body decoding. If the connection stalls, the reader shows an actionable timeout
and Retry; retry is explicit and uses the same message grant. Closing the reader
cancels its attempt quietly. Larger files can still be downloaded.

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
real report-dialog deadline/retry/close/stale-attempt controls using synthetic
held responses and fake timers, browser turn cancellation, and a real isolated HTTP Stop test with a delayed
synthetic browser. The Stop test checks revoked credentials, the exact session
close, blocking a replacement turn and explicit recovery. No provider account
or native browser download is required for these portable tests.

Live-provider observations and their limits are recorded separately in
[the dated acceptance record](../../research/browser-report-2026-10-08.md).

The separate [synthetic browser login check](browser-login.md) closes and replaces
the native daemon before verifying an encrypted loopback cookie/localStorage
restore. It complements this recipe without using real website accounts.

### Source development modal lifecycle

The actual report-button interaction suite also mounts the reader under the
source entry's React StrictMode. Opening stays visible through effect replay;
explicit Close and Escape cancel the current read, restore trigger focus, and
ignore dismissed late responses before a fresh reopen. These synthetic DOM
checks address the development lifecycle; they do not establish a packaged
production or native Chromium failure or a new desktop acceptance run.

### Reader continuity as messages leave the visible window

The reader belongs to the active conversation rather than its report's mounted
message row. Appending messages can evict that row without closing a pending
read or cancelling its PDF export. Switching bots or threads closes the reader,
as does selecting a branch that excludes its source, removing or changing the
source message, or changing its stored file grant. Unrelated message updates
retain it. Server checks still authorize every
file read; keeping a dialog open does not grant new access.

`pnpm test:core` maintains the real ChatView continuity suite and the complete
message-row render suite. The 13 continuity cases use disposable DOM fixtures,
held synthetic reads and controlled PDF promises to exercise actual row
eviction, authority changes, unchanged message replacements and attachment
grants. These checks establish source behavior; native focus, appearance and
PDF export on a new packaged build require separate acceptance.
