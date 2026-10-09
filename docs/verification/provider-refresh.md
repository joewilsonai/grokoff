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

Device-code and ChatGPT browser sign-in recovery runs through real Settings,
StoreProvider and owner-scoped in-memory auth sessions with synthetic HTTP:

```sh
pnpm exec vitest run src/components/DeviceSignIn.recovery.test.ts src/components/DeviceSignIn.test.ts src/components/GrokSignIn.interaction.test.ts src/components/ChatGptPlanSignIn.interaction.test.ts
```

The lifecycle cases cover Codex, Grok Build and the ChatGPT plan: confirmed
sign-in stays connected when model discovery fails, Check again retries only
discovery, and focus or closing/reopening Settings cannot replay login. The
real 30-second discovery deadline is advanced with fake timers; it is not a
native wall-clock measurement. Cancel or closing Settings aborts held status
transport and ignores late success. Codex/ChatGPT account-panel sign-out uses
the actual confirmation control and synthetic mutation response; stale model
success or failure cannot restore the account. These tests open no provider
page, run no CLI and access no credentials. Static URL tests and the older
hook-shim route tests establish narrower rendering/route behavior.
