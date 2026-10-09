# Welcome flow and guided tour

<!-- GrokOff modification (2026-10-09): local-only first-run recipe, real disabled-analytics regression, and private native fixture cleanup. -->

Launch the isolated full-app fixture following [Chat UI](chat-ui.md):

```sh
node --experimental-strip-types scripts/control-omb.ts ui launch
```

In a second terminal, pass its exact printed handle:

```sh
node --experimental-strip-types scripts/verify-onboarding-ui.ts /tmp/openmausbot-verify-data-XXXXXX/ui.json
```

Use a fresh fixture. Standard UI launches explicitly mark their owned server
onboarding complete so other chat/Settings recipes remain unobstructed. This
recipe resets only that checked fixture server's onboarding record, clears only
its browser storage, then opens the `?onboarding=1` entry. It uses
the real renderer and fake-engine server. No provider login, real phone
pairing, native permissions or user workspace is involved.

Assertions cover an optional local profile name with no email field,
profile-save failure and retry, reduced-motion reel playback, engine refresh
failure without losing inventory, no phone offer, welcome completion,
every guided tour step, persistence after clearing browser storage and
reloading, Settings replay, skipping while Next is saving, closing welcome
while its save is pending, and failed replay retry on a server-completed
workspace. Screenshots
are retained in `.omb-scratch/verify-evidence/onboarding/` with a PASS line for
each workflow. Actual provider authentication and native Electron permissions
remain covered by their separate platform recipes, not this browser fixture.

Stop the launcher with Ctrl-C. Open, subsequent commands and close use the
same canonical `grokoff` namespace and socket identity derived from its private
HOME. Cleanup captures every verified native session in that private namespace,
including the bot browser opened by the guided tour, then stops its preview/server
before closing those sessions. Close acknowledgement alone cannot remove HOME:
the exact captured daemon/Chrome processes must have exited. Native acceptance
requires a POSIX `ps` inventory; unreadable or uncertain ownership retains HOME.
Cleanup stops only owned processes and retains that HOME on a failed close. Keep
the handle, native process identity and final cleanup checks with private
evidence; never kill by name or inspect a user browser profile.

## Maintained GrokOff checks

`pnpm test:core` adopts the complete onboarding state, WelcomeGate, HelloBeat
and FirstConversationTour files, plus the disposable UI isolation regressions.
WelcomeGate uses the real disabled analytics module: a satisfied email gate
cannot suppress a fresh local welcome. Existing server completion/version,
remote/read-only and replay boundaries remain covered. Email collection,
telemetry and automatic phone offers stay disabled.

The isolation checks exercise canonical private environment identity and an
actual owned child processes: unsuccessful browser close retains HOME while
stopping the server; two synthetic sessions are both closed; an acknowledgement
and removed PID file without a process exit still retain HOME. Confirmed exits
permit removal; separate owned-process controls cover orphan/late private
browser profiles and a discovered executable without changing the launch
environment. These controls use Node subprocesses as synthetic native helpers,
not a real Chrome auto-discovery run. The component fixtures stub
transport/state or hooks and do not prove real React scheduling. The renderer
recipe above supplies separate full-App save/retry/skip/reload evidence. Its
feature reel is an illustration, not acceptance of every feature it depicts.
Inherited hosted-state unit branches are defensive coverage; they do not enable
or establish a hosted GrokOff service.


## Inherited organization/hosted verification record (Sep 23 2026)

This preserved upstream record is historical. GrokOff disables the hosted
organization offer; the table and retained historical images below are not
current GrokOff service or enrollment acceptance.

What each first-run surface depends on, and how it was checked:

| Who opens the app | What they get | Checked by |
|---|---|---|
| Desktop app, own server (full bridge, `remoteClient` present) | The same flow as before, decided without a new request | `src/components/onboarding/WelcomeGate.test.ts`; `HelloBeat`/`EnginesBeat` HTML compared byte for byte with main (no bridge) |
| Hosted workspace opened inside the desktop app (reduced bridge, no `remoteClient`) | Treated like a browser: the server is asked | `src/components/onboarding/WelcomeGate.test.ts` |
| Packaged desktop with the organization bridge | An optional "Using OpenMausBot at work?" row on the engines beat; a signed-in Company engine counts as ready | `src/components/onboarding/beats/OrganisationRow.test.ts`, `src/components/onboarding/beats/EnginesBeat.test.ts` (fake bridge) |
| Browser, admin of a hosted workspace | Greeting (no inputs) and the bot beat only | `src/components/onboarding/WelcomeGate.test.ts`, `src/components/onboarding/beats/HelloBeat.test.ts`, `src/lib/onboarding.test.ts` |
| Browser, hosted member (no admin scope) | No welcome flow; one dismissible note kept in browser storage; no first-conversation spotlights | `src/components/onboarding/WelcomeGate.test.ts`, `src/components/onboarding/FirstConversationTour.test.ts` |
| Browser, client-scope session on a server that is not hosted | Nothing new: the flow does not open itself (it could not be saved); Settings replay and spotlights as before | `src/components/onboarding/WelcomeGate.test.ts`, `src/lib/onboarding.test.ts` |

`GET /api/auth/session` adds `hosted: true` for a session on a hosted
workspace and is otherwise unchanged (`server/hosted-access.test.ts`,
`server/email-signin.test.ts`).

On a fresh `ui launch` fixture, the recipe above still passed end to end
through the new session check. In the same fixture browser, a client-scope
paired session with the server's onboarding record reset got no welcome flow.
That run also showed the member note, which review then limited to hosted
workspaces (the fixture is not hosted). The hosted-only rule is covered by the
tests above, not by a rerun. In that run, "Got it" made no `/api/config`
write, and the note stayed away after a reload. The engines beat was mounted from the Vite preview with a fake
`window.ogb.organization` injected before mount; it showed the row signed out,
then connecting with the code, then connected. `begin` ran once, with the
default Admin. Screenshots are in `.omb-scratch/verify-evidence/onboarding/`.

Not covered here: the real Electron preload bridge and a real Admin enrolment
(see [organization connection](organization-settings.md), not rerun for this
change), and a real hosted tenant's browser. The hosted beat set was rendered
from a temporary preview entry, not reached through a hosted sign-in.
