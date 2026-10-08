# GrokOff: Mac architecture and reusable open-source components

Research date: October 8, 2026. This is a feasibility assessment, not a completed integration, build, or security audit. Only official project documentation/source and read-only local metadata were used. No software was installed, model calls submitted, or paid infrastructure started.

## Recommendation

**For Joe's requested open-source Grok Bot clone, first evaluate the community edition of OpenMausBot as a fork.** It already implements the product shape: bot contacts, individual model choices, persistent threads, tools, approvals, desktop/browser access, and selectable computers. Electron materially reduces initial work here because both the UI and harness already exist. Retain upstream attribution, remove `enterprise/`, and audit the inherited dependencies, network services, telemetry, secrets, and tool boundaries before shipping anything as GrokOff.

**For an explicitly native Mac product, use SwiftUI/AppKit plus a separately owned TypeScript agent service.** That is feasible on this Mac and avoids forcing the model/tool ecosystem into Swift, but it creates a second UI implementation and a two-runtime packaging problem. A native frontend is a product investment, not a prerequisite for an `.app`.

I would not pick Tauri for this particular first version: with a TS daemon and Swift automation helper it becomes a Rust + TS + Swift system, while providing neither the immediate reuse of the Electron clone nor the all-native Mac UI. Tauri remains credible if compact cross-platform packaging becomes a stated priority.

These are engineering judgments. No candidate has been built or benchmarked here.

| Implementation route | What it buys | What it costs | Recommendation |
| --- | --- | --- | --- |
| Fork OpenMausBot community | Existing full desktop product and provider/computer adapters | Broad inherited code and network/service assumptions; must validate license exclusions and permissions | Fastest candidate to evaluate, never call it audited safe |
| Fresh Electron + TS | One primary language, Chromium browser reuse, direct Mac `.app` packaging | Build bot/session/approval/runtime features; larger shipped runtime | Best clean implementation if the fork audit or inherited product shape is unsuitable |
| Fresh SwiftUI + TS | Native Mac behavior and direct framework integration | Rebuild views, two runtimes, bridge/support/signing work | Best only when native Mac UX is an explicit product priority |

## What is actually present on this Mac

Observed with `command -v`, version commands, Spotlight, and the application's bundle plist:

| Item | Observed |
| --- | --- |
| Hardware architecture / OS | `arm64`, macOS `27.0` build `26A428` |
| Xcode | `27.0`, build `27A266a`; selected `/Applications/Xcode.app/Contents/Developer` |
| Swift | `6.4`, target `arm64-apple-macosx27.0.0` |
| Node / npm | `v26.5.0` / `11.17.0` |
| Other available commands | `pnpm`, `bun`, `gh`, `git` |
| Not found on this shell's PATH | `cargo`, `docker`, `podman`; this is not proof that no runtime exists elsewhere |
| Installed Grok Bot | `/Applications/Grok Bot.app`, version `0.68.1` |

The installed Grok Bot is **Electron**: `NSPrincipalClass=AtomApplication`, an Electron Framework bundle, and `Resources/app.asar` are present. Its plist declares `com.anysphere.sand`, URL schemes `grokbot` and `sand`, minimum macOS `12.0`, and copyright `2026 SpaceXAI`. The retained identifier is an observation; it does not establish the app's source lineage, ownership history, or a Cursor fork by itself. Source: [installed plist](/Applications/Grok%20Bot.app/Contents/Info.plist).

## Shell alternatives

| Shell | Documented mechanism | Practical implication for GrokOff |
| --- | --- | --- |
| SwiftUI/AppKit | Apple's native UI plus direct system frameworks | Best Mac conventions, settings, menus, permissions, Keychain and VM integration. Need to build the chat UI and package/upgrade a TS service. Native views can embed a browser/desktop stream. |
| Tauri 2 | Rust host and OS webview; sidecars may be written in any language | Smaller shell than shipping Chromium, but browser automation likely needs Chromium separately. A Swift helper can be a signed sidecar; native macOS Swift bridging is an integration task, not automatic. |
| Electron | Bundled Chromium and Node; TypeScript/React UI and Node services | Closest to installed Grok Bot and the best matching OSS alternative. Browser and frontend ecosystem can be reused; packaged Chromium brings update obligations and a larger runtime. |

Tauri is MIT or Apache-2.0; Electron is MIT. Each dependency still needs its own notices. [Tauri architecture](https://v2.tauri.app/concept/architecture/), [sidecar packaging](https://v2.tauri.app/develop/sidecar/), [Electron introduction](https://www.electronjs.org/docs/latest/), [Electron license](https://github.com/electron/electron/blob/69ac0e1ed1fdb872dd0b74e625f51306612fb489/LICENSE).

For Electron, remote browser content must have Node integration disabled, context isolation and renderer sandboxing, tightly scoped IPC, and a restrictive content policy. A compromised browser page cannot be allowed to call the local agent service as trusted UI. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

## Existing clones: reuse assessment

### OpenMausBot — closest match

Verified current source commit: `3e9e42b3a05e0b7c4edbaedba2e667b851296e27`; package version `0.1.102`, Node `>=24`, Electron `^43.5.0`, React/TypeScript. Its harness owns local agent processes; chat/tool events are normalized for the frontend. Local CLI engines and an OpenAI-compatible driver are present. Its desktop integration uses Cua Driver; connectors use Composio; remote computers include Boat and a BYO VPS lane. These external services need independent configuration/cost review. [Source README](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/README.md), [package](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/package.json).

Root code is Apache-2.0. **`enterprise/` is explicitly excluded**: its separate license permits evaluation but prohibits redistribution and requires a license key for enabled production enterprise features. It says deleting that directory leaves a working open-source edition. Do not rebrand the whole tree without this exclusion. [Root license](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/LICENSE), [enterprise license](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/enterprise/LICENSE).

Preserve third-party notices rather than treating every file as Apache: for example, vendored Cua Driver, T3 code and Lobe provider icons have MIT notices; the Whop asset directory carries Apache terms. Replace the upstream product's branding for GrokOff, and verify brand/trademark and every redistributed binary/image separately. This sampling is not a complete bill-of-materials review. [Cua notice](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/third_party/cua-driver/LICENSE.md), [T3 notice](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/third_party/t3-code/LICENSE), [icon notice](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/third_party/provider-icons/LICENSE-Lobe-Icons.txt).

Its **“Local VM” means Docker/Podman Linux desktops**, not a dedicated macOS VM per bot. Persistence comes from mounted workspace/profile directories; per-bot containers can run concurrently. On Mac, containers share their container runtime's underlying Linux kernel/VM. [Local VM source docs](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/apps/docs/content/docs/computers/local-vm.mdx).

The current source also recognizes Apple's `container` runtime, while requiring Docker/Podman for per-bot instances. Apple container's VM boundary is different; do not project Docker's shared-kernel semantics onto that runtime. The container implementation uses a digest-pinned Cua XFCE base, validates mounts/ownership/security/loopback viewer binding before reuse, and executes guest commands as the `cua` user with a timeout. These are inspected controls, not a tested escape-proof boundary. [Container implementation](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/server/container-computer.ts).

Its documented harness authentication boundary is nuanced:

- The server listens on loopback. Packaged desktop reads may be anonymous; public mutations need Electron's private per-launch capability or a paired session. Internal bot routes have narrower per-turn capabilities. Bearer/cookie sessions and event-stream tickets have different validation paths. [Request authentication](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/server/request-auth.ts).
- A locally running CLI remains a process with the user's privileges. Provider permission prompts are a consent layer. Codex Ask/Auto uses `workspace-write`; Full sets `danger-full-access` and no approvals. Claude Full selects `bypassPermissions`. Choosing a container computer does not by itself prove that every possible CLI tool runs in that container. Verify each engine's tool routing, disable host built-ins when necessary, and test the actual denied access. [Codex driver](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/server/drivers/codex.ts), [Claude driver](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/server/drivers/claude.ts).
- The source policy explicitly describes a **known unresolved shared-server Slack route issue**: a sessionless local bot shell can post into a Full-access thread or open one when shared Full access is enabled, then obtain work without a new card. A worker-only relay token is planned. This makes shared hosting a concrete review target before reuse; it is documented upstream, not a vulnerability independently reproduced here. [Security policy](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/SECURITY.md).

The Codex driver speaks its app-server JSON-RPC over stdio and waits for a real `turn/completed` event; the UI does not simply scrape terminal text and guess completion. A GrokOff fork should retain structured completion/permission handling across engines instead of turning all CLIs into fragile console parsers. Source: the Codex driver above. A full cross-provider protocol review remains outstanding.

The standalone OpenAI-compatible custom-engine documentation describes environment values in mode-0600 `config.json`. The packaged Electron path separately migrates supported workspace credential fields into an encrypted `safeStorage` store before starting its child server. These are different storage paths; file permissions alone do not encrypt headless configuration. Qualify custom-engine secret fields individually before distribution; this research does not establish that every arbitrary environment field is encrypted. [Custom engine source docs](https://github.com/milind-soni/OpenMausBot/blob/3e9e42b3a05e0b7c4edbaedba2e667b851296e27/docs/custom-engines.md).

### Eidon — self-hosted web product

Verified commit `3d32234d3ff7be8b91efab3140f9868f29e4f6fc`: AGPL-3.0-only, Next.js/React, SQLite and a Docker deployment. Agents have chats, browser sessions, files and delegation; the distribution is web/PWA rather than a ready Mac desktop shell. Suitable for inspiration or a consciously AGPL fork; less direct for a native app. AGPL changes need matching source availability when its applicable distribution/network provisions are triggered. [Repository](https://github.com/Quack6765/Eidon-AI), [package license declaration](https://github.com/Quack6765/Eidon-AI/blob/3d32234d3ff7be8b91efab3140f9868f29e4f6fc/package.json), [license](https://github.com/Quack6765/Eidon-AI/blob/3d32234d3ff7be8b91efab3140f9868f29e4f6fc/LICENSE).

A checked-in computer-analysis document reports a same-UID shell/browser/server and `--no-sandbox` Chromium in the version it inspected. That document also proposes later isolation changes. It is **historical implementation evidence, not proof of current deployed behavior**; inspect the actual pinned launcher before reusing its “sandbox” promise. [Analysis document](https://github.com/Quack6765/Eidon-AI/blob/3d32234d3ff7be8b91efab3140f9868f29e4f6fc/docs/plans/agent-computer-analysis.md).

### Munder Difflin — agent office, different UI

Verified commit `2c64612780958805d99f559d8dd7d076d887bcb7`: source MIT, Electron/React/TypeScript, terminal agents through `node-pty` and xterm, visual office via Pixi, markdown memory/mailboxes. Useful harness ideas; the office metaphor differs from Grok Bot contacts. Its checked package still declares Electron `^32.2.0`; a reused build needs a current-runtime upgrade assessment. [Repository](https://github.com/HarnessMD/munder-difflin), [package](https://github.com/HarnessMD/munder-difflin/blob/2c64612780958805d99f559d8dd7d076d887bcb7/package.json), [MIT license](https://github.com/HarnessMD/munder-difflin/blob/2c64612780958805d99f559d8dd7d076d887bcb7/LICENSE).

Bundled LimeZu pixel art has separate terms, including required credit and prohibited asset redistribution/resale. Exclude/replace those assets in a freely redistributable fork unless suitable permission is obtained; the root MIT license does not cover them. [Asset exclusion](https://github.com/HarnessMD/munder-difflin/blob/2c64612780958805d99f559d8dd7d076d887bcb7/LICENSE-ASSETS), [asset terms](https://github.com/HarnessMD/munder-difflin/blob/2c64612780958805d99f559d8dd7d076d887bcb7/src/renderer/src/assets/tilesets/LIMEZUASSETS-LICENSE.txt).

## Agent runtime/library options

| Component | Verified license/source | Use and limitation |
| --- | --- | --- |
| Hermes Agent | [MIT at `d687605`](https://github.com/NousResearch/hermes-agent/blob/d687605c7b6ee8d1c5f17b76870a7dd0eb414e06/LICENSE) | Persistent memory, skills, scheduling, subagents, several terminal backends and model providers. A complete Python-based personal-agent runtime; adopting it adds Python packaging and its own state/memory conventions. [README](https://github.com/NousResearch/hermes-agent/blob/d687605c7b6ee8d1c5f17b76870a7dd0eb414e06/README.md). |
| OpenHands Software Agent SDK | [MIT at `16662b0`](https://github.com/OpenHands/software-agent-sdk/blob/16662b0bd2c1a93d3c5e282b48da05b95e90a0c8/LICENSE) | Python SDK/server with REST and TS client, conversation/workspace/events/tools. Good modular coding-agent engine; general personal bots and Mac computer UI still need product work. [README](https://github.com/OpenHands/software-agent-sdk/blob/16662b0bd2c1a93d3c5e282b48da05b95e90a0c8/README.md). |
| Letta Code | [Apache-2.0 at `3a958a4`](https://github.com/letta-ai/letta-code/blob/3a958a40c3484f69c4812049a14a09368cc13ee5/LICENSE) | Stateful memory/identity harness. Current Letta repository redirects development to Letta Code; do not plan on the archived V1 API. Its README defaults to Letta Cloud, with a selectable local backend. [README](https://github.com/letta-ai/letta-code/blob/3a958a40c3484f69c4812049a14a09368cc13ee5/README.md). |
| Cua Driver / Lume | [Root MIT at `c1c2b5f`](https://github.com/trycua/cua/blob/c1c2b5fee428c3a39bebe5e77549c3d3525a608d/LICENSE.md), subject to directory overrides | Driver: desktop automation. Lume: Apple Silicon macOS/Linux VMs using Virtualization.framework; its Swift package targets macOS 14+. Inspect optional third-party extras separately. [Repository](https://github.com/trycua/cua), [Lume package](https://github.com/trycua/cua/blob/c1c2b5fee428c3a39bebe5e77549c3d3525a608d/libs/lume/Package.swift). |

**Cua Spaces and multiple shared Spaces crates are FSL-1.1-MIT, not MIT today.** The app, app-core, Keyvault and Spaces CLI have local FSL licenses restricting commercial competing use until their future MIT grant takes effect after two years. A root MIT badge is insufficient. Exclude those components from GrokOff's unrestricted OSS base. [Spaces app license](https://github.com/trycua/cua/blob/c1c2b5fee428c3a39bebe5e77549c3d3525a608d/apps/cua-spaces-macos/LICENSE), [app-core license](https://github.com/trycua/cua/blob/c1c2b5fee428c3a39bebe5e77549c3d3525a608d/libs/cua/crates/cua-spaces-app-core/LICENSE), [Keyvault license](https://github.com/trycua/cua/blob/c1c2b5fee428c3a39bebe5e77549c3d3525a608d/libs/cua/crates/cua-keyvault/LICENSE).

## Execution environments: do not mislabel the boundary

1. **Workspace folder + browser profile:** keeps files/logins organized. An ordinary process can still access the host with its user privileges. Not OS isolation.
2. **Container desktop:** stronger process/filesystem boundary; per-bot containers share a kernel. Host bind mounts, Docker socket exposure, broad secrets and network permissions can defeat intended separation. On Mac this ordinarily entails a shared Linux VM through the container runtime.
3. **Dedicated VM per bot:** separate guest OS and VM lifecycle, with explicit shared folders and credentials. Native Mac apps require macOS guests; Linux desktop/browser tasks can use Linux guests. Apple Silicon macOS virtualization is a real documented option, not just a folder. [Apple VM example](https://developer.apple.com/documentation/virtualization/running-macos-in-a-virtual-machine-on-apple-silicon).
4. **Remote computer:** can continue while the Mac sleeps, but introduces provider credentials, provisioning, costs and remote trust. The transport and computer provider should be interchangeable.

The app's renderer sandbox and Apple's App Sandbox are separate concepts from the environment in which an agent's shell executes. Do not claim complete bot isolation solely because Electron, Tauri or the `.app` is sandboxed.

## Native clean-build shape, if that route is chosen

- **SwiftUI/AppKit client:** bot roster, streaming chat, visible run state, inline approvals, workspace picker, browser/desktop preview, settings, menu bar and notification surface.
- **TS agent service:** provider adapters, tool loop, cancel/steer, typed event log, per-bot sessions, SQLite persistence, scheduler, MCP tool adapters and environment interface.
- **Swift platform service/helper:** Keychain, file grants, Accessibility/Screen Recording permission checks, optional Virtualization.framework. Keep native privileges in a narrow bridge; the model never receives arbitrary native IPC access.
- **Environment interface:** local controlled workspace, container, dedicated VM and remote host expose the same file/exec/browser/screenshot/input/lifecycle contract. Store IDs and state, not live credentials, in chats.
- **Credentials:** Keychain-backed; inject only the active provider/tool's secret into its worker. Secrets entered through human login/handoff must not appear in model-visible events.
- **Transport:** Unix-domain socket or authenticated loopback API, explicit protocol version, event sequence numbers and crash recovery. Separate untrusted browser views from the trusted chat UI.

Apple references: [Keychain services](https://developer.apple.com/documentation/security/keychain-services), [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit), [App Sandbox](https://developer.apple.com/documentation/security/app-sandbox). These require implementation-specific permission validation on the chosen deployment target.

Apple's current VM sample defaults to macOS 27 and includes a newer shared-base-image example; older deployment targets require conditional removal/adaptation of those APIs. The underlying VM approach predates that sample update, and Lume's checked package targets macOS 14. Pick GrokOff's support floor deliberately rather than copying the newest sample unchanged. Source: the Apple VM example above, fetched through its official Markdown representation.

## Practical vertical slice and evidence gates

1. **Reproducible base:** inspect/freeze candidate revision and licenses, exclude restricted components, build community `.app` without cloud calls, confirm no upstream identity/services are accidentally required. If native is chosen, first package Swift + TS worker and prove relaunch, shutdown and protocol compatibility.
2. **One real bot:** BYOK model, streaming conversation, persistent bot identity/history after restart, cancel/steer, one explicit workspace and a real file artifact. Verify missing key, model error and interrupted run behavior.
3. **Browser work:** isolated profile, navigate/read/click/type, visible browser, human takeover for login, secrets out of chat/tool logs, approvals before external writes. Evaluate model tool/vision support instead of assuming any compatible endpoint is capable.
4. **Multiple bots:** independent memory/workspaces and tool grants, event ownership, concurrency limit, no cross-bot cookie/key leakage. Add group delegation only after direct conversations are reliable.
5. **Selected computer:** container or dedicated VM lifecycle with start/stop/reuse/delete semantics. Demonstrate an agent cannot read a host fixture outside the explicit mount, plus persistence after restart. Only then label the boundary accurately in the UI.
6. **Release:** signed/notarized app and helpers, migration/export, update signature checks, dependency notices, crash handling, telemetry decision and documented resource requirements. Direct distribution is the natural initial route; App Store constraints need a separate scope review. [Electron signing/notarization](https://www.electronjs.org/docs/latest/tutorial/code-signing), [Tauri Mac distribution](https://v2.tauri.app/distribute/macos-application-bundle/).

Local execution pauses when this Mac is asleep or the runtime is shut down. Always-on cloud work must be implemented as an actual remote runner; a scheduler in the GUI cannot solve that limitation.
