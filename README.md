# GrokOff

<!-- GrokOff modification (2026-10-08): independent fork identity, source-alpha setup, and verified scope. -->

A local-first, open-source Mac workspace for persistent AI bots. Create a team, give each bot a role and working folder, and follow its conversations, tools, and approvals.

**Source alpha.** There is no public binary release or signed installer yet. Joe Wilson maintains this independent project at [joewilsonai/grokoff](https://github.com/joewilsonai/grokoff).

GrokOff builds on the Apache-2.0 community edition of [OpenMausBot](https://github.com/milind-soni/OpenMausBot), by Milind Soni and contributors, at commit `3e9e42b3a05e0b7c4edbaedba2e667b851296e27`. It is inspired by persistent-agent workflows such as Grok Bot and is not affiliated with xAI or OpenMausBot's maintainers. No proprietary Grok Bot implementation was imported.

## What works today

- Bot rosters, individual conversations, and group conversations.
- Provider connections, per-bot models, working folders, memory, and routines.
- Tool and file access with approval controls; browser and desktop controls when their dependencies and permissions are configured.
- A separate GrokOff app identity, GO icon, and `~/.grokoff` data directory.

Local startup, simulated chat, request boundaries, and restart persistence have been checked. Bounded real tasks also passed with **Claude Sonnet 5.5** and **Codex GPT-6-Astra at Medium**, including an observed tool read and completed reply. These checks do not establish reliability for every inherited feature, model, connector, or automation. See [verification](research/verification.md), [subscription acceptance](research/subscription-live-acceptance.md), and [the roadmap](ROADMAP.md).

## Run from source

Requires **Node.js 24+**, **pnpm 10.33.0**, and macOS for the supported desktop alpha. Install and sign in to an official provider CLI, or configure a supported API provider, to run real AI tasks.

```sh
git clone https://github.com/joewilsonai/grokoff.git
cd grokoff
pnpm install
pnpm dev:server
```

In another terminal, run `pnpm dev` for the web interface. With both development servers running, `pnpm dev:desktop` starts Electron. Desktop preparation downloads and verifies the pinned tunnel helper; it does not enable a hosted GrokOff service.

For an isolated fixture with temporary data and a fake provider:

```sh
node --experimental-strip-types scripts/control-omb.ts launch
```

Follow [the verification guide](docs/verification/README.md). Run mutation checks against disposable fixtures, never your live bot data.

```sh
pnpm typecheck
pnpm build
pnpm build:server
```

To build the Apple Silicon desktop app locally, install Xcode command-line tools first:

```sh
pnpm package:grokoff
```

This prepares the pinned browser, CUA driver, tunnel, and speech helpers and creates `release-grokoff/mac-arm64/GrokOff.app` with publishing disabled. The local app is unsigned and not notarized. Intel Mac, Windows, and Linux releases are not established by this alpha.

## Connect Claude or Codex

Open **Settings → Model providers** to detect the official Claude Code and Codex CLIs and reuse their signed-in accounts, or complete provider sign-in. The default subscription adapters require recognized subscription authentication and block API-key or unknown authentication instead of silently switching to API billing. Explicit API connections remain separate.

Provider services and models are not made open source by GrokOff. Your provider's limits, eligibility, terms, and any enabled extra-usage charges still apply. Signing out of a shared CLI account affects other local uses of that CLI. Read [subscription connections](docs/subscription-connections.md) before connecting accounts.

## Local edition boundaries

This edition supplies no hosted cloud subscription, vendor organization enrollment, billing service, or GrokOff mobile app. Upstream hosted defaults, product analytics, and automatic updates are disabled. Routines require the app and Mac to stay running.

Managed browser state uses the `grokoff` namespace. A fresh launch does not create a phone-pairing key; explicit companion use initializes it through encrypted OS storage. Provider CLIs can run with your Mac user's privileges. Separate bot folders, profiles, and approval levels do not guarantee an operating-system sandbox. Host desktop control starts off on every launch; enabling it may request Accessibility and Screen Recording permissions. Review [the security policy](SECURITY.md) and [fork security notes](docs/design/fork-security.md) before granting access.

## Contribute and license

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [the code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through the private channel in [SECURITY.md](SECURITY.md).

Community source retains [Apache-2.0](LICENSE), [NOTICE](NOTICE), and its third-party licenses. The upstream `enterprise/` edition is excluded. [LICENSING.md](LICENSING.md) explains the source, trademark, runtime, and provider boundaries; [UPSTREAM.md](UPSTREAM.md) records provenance. The preserved [upstream README](docs/upstream/OpenMausBot-README.md) describes upstream products and services, not GrokOff.
