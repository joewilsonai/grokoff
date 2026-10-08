# GrokOff first local edition: dispatch boundary

2026-10-08. This is a narrow change to the inherited community runtime, not a claim of comprehensive isolation or hosted-service support.

## Applied change

Session-less loopback callers on a `service`-trust server can no longer create Bot tasks with `POST /api/bots/:id/tasks` or dispatch messages with `POST /api/bots/:id/messages/guarded`. The upstream allowlist admitted both the Slack worker and every Bot shell in the same network namespace. That let a caller invoke another Bot's existing Full-access thread, or create one when shared Full access was enabled, without a fresh human approval.

GrokOff removes those two routes from `SERVICE_ALLOW` in `server/request-auth.ts`. Authorization rejects them before route/body processing. A configured packaged desktop still needs its private per-launch mutation capability, and authenticated sessions keep their existing scope checks. `/api/internal/` routes retain their separate turn-scoped bearer validation in their handlers; passing the outer loopback gate is not permission to use those tools.

## Feature limitation

The upstream session-less cloud Slack worker dispatch protocol is unsupported in the first GrokOff edition. No new Slack backend, worker identity, public relay, or cloud service is supplied. A future hosted worker must authenticate separately and bind operations to its permitted Bot/thread before those routes can be offered to it.

The remaining inherited service allowlist includes reads, request interruption, queue withdrawal, and card refusal. A service process can still interfere with that work. Removing dispatch closes the documented Full-access invocation path; it does not make service processes mutually isolated or qualify a shared multi-user deployment.

Ordinary one-owner headless mode retains upstream loopback-owner trust; packaged mode retains its private mutation capability. Provider CLIs may execute with the Mac user's privileges, and Full access explicitly removes some provider approval/sandbox restrictions. Browser profiles, Bot identities, and this HTTP route gate are not OS sandboxes.

## Regression evidence

`server/request-auth.test.ts` checks that both dispatch routes reject a session-less service caller and a guessed desktop header, accept an authorized session, reject a packaged caller missing its token, and accept its exact configured desktop token. It also checks that the outer internal-capability route path remains reachable for its handler's narrower authorization. Existing tests retain origin, paired-session scope, proxy, private desktop capability, and limited service-route coverage.

These are authorization-resolver tests using temporary session files. They do not claim end-to-end provider, Slack, GUI-control, or live service verification. The task's verification record states actual command results separately.

## Host control startup

Host desktop control starts off on each GrokOff launch. The main process clears
a previous ready descriptor without asking for OS permissions, starting a driver
or adopting a standalone daemon. An explicit Local Control Enable/retry can start
the helper and request Accessibility or Screen Recording grants. This boundary
was tested with mocked native interfaces; actual OS grants and desktop actions
remain unexercised. Linux fleet and vendor cloud-image deployment are unsupported
in this first Mac edition and retain internal upstream names.

## Browser state and runtime sockets

The managed browser uses the `grokoff` agent-browser namespace by default. Saved
logins and its empty managed configuration live under
`~/.agent-browser/namespaces/grokoff/state`; the upstream default namespace is
neither imported nor cleared. Explicit test namespaces and socket-directory
overrides remain supported.

Native agent-browser 0.37.0 appends `namespaces/NAME/run/SESSION.sock` to its
runtime root. A namespaced UUID Bot under an ordinary or fixture home can exceed
macOS's 103-byte socket limit. GrokOff therefore gives its runtime a short
`/tmp/gof-<hash>` directory whose identity includes the effective home, uid and
namespace. The directory must be owned by the current user, must not be a
symlink, and has mode 0700. Browser commands refuse overlong socket paths before
starting a daemon; long custom profile names may need shortening. Persistent
login files remain in the home namespace. This separates application state; it
does not sandbox browser or provider processes from the Mac user.

The focused regressions cover namespace propagation, saved-state independence,
private socket ownership/permissions, socket-length refusal, and literal dotted
profile names during pending-save cleanup. With
`GROKOFF_NATIVE_BROWSER_TEST_BIN` pointing at the staged or packaged engine,
`server/browser-engine-native.test.ts` also executes that real binary in a long
disposable home: prepare a UUID Bot, initialize MCP, list browser tools, close,
and clean up. It does not navigate or inspect a user's browser.
