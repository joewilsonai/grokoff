<!-- GrokOff modification (2026-10-09): add isolated pasted-code completion and retry verification. -->
# Claude account sign-out

Use only the disposable offline fixture. It never invokes a real Claude
executable or reads a real credential store.

```sh
node --experimental-strip-types scripts/verify-claude-account.ts
```

The launcher prints its API URL, preview URL, command log, disposable home,
and `failLogoutMarker`. Run Doctor against that exact API URL, then open the
preview. In Settings → Engines, the synthetic **Claude review** account is
connected as `ada@example.test`.

1. Open **Manage account and sign-in → Sign out of Claude**. Cancel once and
   confirm the identity remains. The confirmation warns that running tasks
   are not cancelled; stop them before switching subscriptions.
2. Confirm sign-out. The fake CLI deliberately fails, leaving the account
   connected. An error must appear and the sign-out button must allow retry.
3. Remove only the printed `failLogoutMarker` inside this disposable home.
   Retry. While pending, Check account, account editing, Remove account and
   Sign out must be disabled. When complete, the identity disappears,
   **Sign-in required** appears, and the setup card offers **Sign in to Claude**.
4. Reload the preview and check the account remains signed out. The command
   log must show `auth logout` followed by `auth status --json`.
5. Close the preview and interrupt the launcher. It removes only its own
   temporary data and retains the printed server log.

The HTTP verification also checks cross-origin rejection, failed sign-out
preserving the synthetic account, successful retry, and an untouched sibling
account. Unit regressions cover a logout that ignores SIGTERM, disposal of
the controller/provider during logout, unknown auth-status results, and the
renderer using the confirmed response without a second catalog request.

```sh
pnpm exec vitest run --no-file-parallelism server/drivers/claude-login-auth.test.ts server/drivers/claude.test.ts server/provider-auth-sessions.test.ts server/request-auth.test.ts src/components/ClaudeAccountSettings.test.ts src/components/CodexAccountSettings.test.ts src/components/EnginesSettings.test.ts
pnpm typecheck
pnpm i18n:check
pnpm build
```

## UI evidence

Confirmation after a forced error; the real Settings surface remains retryable:

![Claude sign-out confirmation](evidence/claude-account/confirmation.png)

This offline check does not prove a real Anthropic account login or OS
credential-store operation. No provider login was used for this review.

## Pasted-code completion and discovery recovery

The maintained renderer regression drives the actual Settings card, store/API
helper and provider sign-in ownership controller against an in-memory fake:

```sh
pnpm exec vitest run src/components/ClaudeSignIn.interaction.test.ts src/components/ClaudeSignIn.test.ts server/provider-auth-sessions.test.ts
```

A successful **Finish sign-in** consumes the code and removes the server's
owner flow. The UI accepts that completion rather than querying the deleted
flow and reporting its expected 404 as a failed login. Model refresh returns
current inventory. Pending discovery and any failure live in the shared store,
so a focus probe confirming login can replace the authentication form without
removing recovery from Settings, the welcome engine row, or the app shell.
**Check again** retries discovery without requesting a new sign-in or resending
the consumed code. A confirmed sign-out clears this recovery.

The fixture checks success, rejected codes, a failed discovery/inventory
response, the shared 30-second model deadline and retry, late responses,
pre-login inventory completing before or after discovery, and an already
signed-in start. It uses the real Settings parent to verify focus during or
after discovery preserves the warning and retry in its open card. It also
checks a ready onboarding row, recovery after leaving that gate or reopening
Settings, concurrent retries joining one discovery request, and sign-out
rejecting a late failure. A completed login arriving after store teardown
must not start another model-discovery request. Two owned synthetic sessions
also verify that an older account's discovery cannot clear recovery for a
second account that has just completed sign-in.
There is no CLI, real credential store,
Anthropic account, subscription-entitlement check or provider inference.
