<!-- GrokOff modification (2026-10-09): document delayed custom CLI discovery ownership checks. -->
# Provider connection checks

Run the real Settings section and StoreProvider in an isolated Electron window:

```sh
node --experimental-strip-types scripts/verify-provider-refresh.ts
```

The fixture serves synthetic Claude/Codex inventory from one dynamically
allocated loopback origin. It starts no harness server or provider process,
uses a temporary home and Electron profile, denies permissions/navigation and
external requests, and rejects every API mutation. It does not access provider
credentials or the running personal app.

At 900px and 390px it checks global **Check again** and each **Check account**:
HTTP 503 produces a readable alert, retains the last account identity, unlocks
retry, and clears the alert when a new successful snapshot arrives. A real
stalled fetch is aborted at the shared ten-second deadline, then retries
successfully; the held HTTP request must close while the window is still alive.
Collapsing/reopening Claude's card keeps its unsaved account-name
draft. Background focus failures remain quiet.
The focus assertion waits for a newly issued inventory GET and its complete
503 response before checking that no alert appeared.

The printed receipt path is inside ignored `.local/provider-refresh-*`; it
records API methods, blocked external requests, native renderer assertions,
the exact owned child PID, and cleanup. Screenshots contain synthetic accounts
only and remain ignored. Success is recorded after the child exits, the owned
HTTP/Vite server closes, and the temporary profile is removed.

Portable coverage uses the actual store, fetch API helper, reducer and account
components; only the SSE boundary and network responses are synthetic:

```sh
pnpm exec vitest run src/state/instance-refresh.test.ts src/components/EngineRefresh.interaction.test.ts src/components/onboarding/beats/EnginesBeat.test.ts src/components/ClaudeAccountSettings.test.ts src/components/CodexAccountSettings.test.ts src/components/EngineLibrary.test.ts
pnpm typecheck
pnpm lint
pnpm i18n:check
```

Those tests additionally check that startup, reconnect, onboarding, focus and
explicit inventory probes share one request. A failed quiet probe cannot hide
successful startup, and startup retains its retries after a shared failure.
Checks superseded by a confirmed mutation follow the replacement's success or
failure, so successful login/save refreshes do not leave false alerts behind.
Authoritative model-discovery and confirmed sign-out inventory also resolves
waiting checks successfully while aborting their obsolete transport.
Late timed-out responses cannot overwrite a confirmed account mutation or
onboarding's fresh post-login inventory. Real Claude-account and CLI save controls mutate
only an in-memory synthetic fixture and require a fresh post-save inventory
lookup; a pre-save response must not restore the old state. Model discovery has
a separate 30-second aborting deadline to allow provider discovery/fallbacks.
A model response overlapping an account/config mutation is discarded, with a
fresh inventory collected after discovery completes; both completion orders
are covered using the actual save control and store. Timed-out model responses
cannot undo confirmed login state. This fixture verifies inventory checks and recovery;
it does not prove live provider authentication, subscription access or inference.


The portable Settings tests also hold **Set CLI…** candidate discovery while a
person edits the manual path, selects a detected binary, or clears the draft.
Discovery updates the available options without replacing those choices. A
chosen binary stays visible even when the new list omits it. The
real probe and PATCH requests must carry the retained replacement path. An
untouched saved override still initializes normally; a failed lookup leaves
manual entry usable. Closing the picker aborts its owned lookup, and a late
response cannot affect the reopened picker. StrictMode setup replay starts a
fresh request after its canceled attempt.

These are actual React/store controls with in-memory API responses. They do
not launch a CLI, access credentials, or establish packaged desktop behavior.
