# GrokOff first Mac build implementation plan

**Goal:** deliver an independently branded, buildable Mac community fork with documented research and verified local startup/chat persistence.

**Architecture:** reuse the OpenMausBot community coordinator and Electron shell, preserving its broker and test fixture boundaries. Remove upstream hosted-service defaults and establish a separate app/data identity. Keep cloud/container claims limited to exercised behavior.

**Tech stack:** existing pinned Electron, React, TypeScript, Vite and Node runtime; existing upstream lockfile. Version changes are not needed for a branding/independence fork.

**Spec:** `2026-10-08-grokoff-design.md` in this directory.

**Execution:** bounded parallel changes with a separate final reviewer. Joe authorized reuse and standing instructions authorize in-scope local reversible implementation; retain external publishing/spending gates.

## Constraints and review focus

Preserve original licenses/notices. Exclude enterprise and upstream publishing automation. Do not change Luna services or an existing application's data. No real credentials/provider calls in fixtures. Review namespace collisions, upstream egress, updater substitution, packaged renderer capabilities, sessionless shared-service dispatch, and persistence after restart.

## 1. Import the community source

- [x] Copy the pinned checkout into the project, excluding `.git`, `enterprise/`, `.github/`, build output and dependencies; preserve this project's research/design files.
- [x] Record upstream URL, commit, included/excluded components and attribution in `UPSTREAM.md` and `NOTICE`.
- [x] Initialize a local Git repository on `codex/grokoff` and commit the unchanged community import. Do not publish it.

## 2. Give the Mac application its own identity

- [x] Update root package metadata, app title and English/localized visible product labels, without rewriting source attribution, licenses or third-party notices.
- [x] Create an original programmatic GrokOff icon and replace entry/loading/tray icons.
- [x] Create a Mac-only packaging configuration with `app.grokoff.desktop`, `GrokOff`, arm64 local output, retained license resources and no publish feed. Preserve original third-party native notices.
- [x] Set application and server default workspaces to `~/.grokoff`; retain explicit fixture overrides. Do not migrate another app's state.

## 3. Remove maintainer-hosted defaults

- [x] Disable product analytics and its identifier capture; include a test that no tracker initializes.
- [x] Disable upstream update checks/downloads, cloud account defaults and implicit connector broker. Explicit custom endpoints must be distinguished from missing configuration.
- [x] Hide unavailable hosted features or give a clear local edition explanation. Never invent a replacement remote domain.
- [x] Check shared-service/sessionless dispatch and close or disable the unsafe route before claiming support.

## 4. Build and verify

- [x] Install pinned dependencies using the existing lockfile and required known registry build scripts.
- [x] Run `pnpm typecheck`, `pnpm build`, `pnpm build:server`, relevant fork/auth/Electron tests, and package a local app with `--publish never`.
- [x] Follow `docs/verification/README.md` with an isolated fake-engine fixture. Record exact bot ID, task ID, fixture URL and logs for create/send/wait/messages and restart persistence.
- [x] Launch the packaged app against a new fixture namespace, confirm rendered startup and owned-server health, then quit and confirm owned helpers exit.
- [x] Run the scoped review required by Elle's runtime instructions, fix HIGH findings, and record remaining limits in `research/verification.md`.

## 5. Handoff

- [x] Link the research index, exact built app path and verification record. Report whether the app was built/launched and which agent/tool capabilities were actually exercised.
- [x] Keep unsigned local build, live-provider validation and production/public release states distinct.

## Acceptance addendum

The packaged Apple Silicon app opened, accepted a native-UI send, displayed the isolated fake reply without Reload, and quit with its owned server gone. Fresh startup creates no phone key; explicit companion use retains encrypted storage and cancellation checks. Browser state has its own namespace and a private short socket path. Formal and independent review findings were corrected with regression checks. Final evidence and untested live integrations are in `research/verification.md`.
