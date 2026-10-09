# Browser/report acceptance — October 8, 2026

This record covers source changes for the GrokOff source alpha. It is not a
signed release or a claim of full Grok Bot parity. Raw account-specific logs,
receipts and temporary paths remain private.

## Live subscription checks

Two bounded tasks passed through the actual GrokOff server and official CLIs:

| Provider route | Model and effort | Observed result |
| --- | --- | --- |
| ChatGPT subscription via Codex | GPT-6 Astra, Medium | Opened and read both controlled pages, saved a report, returned its conversation link; authorized file fetch returned the exact saved bytes. |
| Claude subscription via Claude Code | Claude Sonnet 5.5, Medium | Opened and read both controlled pages, saved a report, returned its conversation link; authorized file fetch returned the exact saved bytes. |

Each task used fresh loopback source pages with a random observation marker,
participant counts, duration and a synthetic-data limitation. The resulting
Markdown contained the marker, all requested facts and both exact source URLs.
Native browser tool activity and source-server requests were independently
observed. Saving used a single-purpose fixture MCP tool limited to one fixed
report path; general shell and file execution were disabled for these probes.

Subscription authentication and the requested models were verified immediately
before dispatch. Official CLI-managed account homes were reused directly;
credentials were not copied into the fixture. These calls consumed subscription
quota and do not establish future model availability or unlimited usage.

The first Codex probe completed its research but the verifier incorrectly chose
a digest message for its file fetch; the server correctly rejected that request.
The first Claude probe stopped at a report-save approval whose structured tool
name the verifier had not recognized. Corrected probes passed for both providers.
No product authorization was relaxed to make the checks pass. All owned native
browser sessions were subsequently confirmed closed in their fixture namespaces.

## Product changes

Markdown report links and attachment chips now have an in-app reader with
download, error recovery and bounded UTF-8 loading. Web citations remain links;
embedded local files, images and raw HTML gain no execution or file authority.

Stop now reaches an in-flight browser request rather than only expiring the
provider's next request. The affected session is closed and quarantined until
explicit recovery. Saved profile files are preserved. Already accepted website
effects remain uncertain and must be checked before retrying.

The [desktop recipe](../docs/verification/browser-report.md) keeps deterministic
UI/persistence checks separate from the live-provider observations above.
Broad web research quality, authenticated-site continuity and a signed binary
release remain outside this evidence.

## Native desktop observations

The repeatable fixture passed in an actual Electron window using the real App
and production preload. Native browser reads matched fresh source markers;
the report displayed headings, a table and both citation targets. Downloads
matched the saved report's SHA-256 before and after a full restart of the owned
server and Electron process. Message IDs and report bytes survived unchanged.

The 390-pixel window retained the open report dialog inside its bounds. Allow
once and Deny reached the real broker; cancelling a pending permission returned
Deny, and Stop ended a separately observed active turn. The fixture's native
browser session was confirmed closed before its temporary data was removed.

These UI and persistence observations use scripted provider events. They do not
prove that a live model ran inside the same desktop process or that an external
source link was activated.

A separately built Apple Silicon `.app` also passed its actual packaged startup,
production preload and bundled-server checks with isolated data. The bundled
renderer opened a persisted report and fetched its exact bytes through the
desktop-authenticated message-file route. The existing package smoke mode now
skips URL-handler registration so verification does not change the user's
application association. The candidate is unsigned and not notarized; it is a
local build, not a published binary release.
