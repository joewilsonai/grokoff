# Contributing to GrokOff

<!-- GrokOff modification (2026-10-08): fork contribution workflow, supported alpha scope, and safe verification. -->

Joe Wilson maintains this independent Apache-2.0 community fork. Open an issue or pull request at [joewilsonai/grokoff](https://github.com/joewilsonai/grokoff); upstream maintainers do not maintain this repository. The current supported desktop target is a Mac source alpha, with no public binary release.

## Before a change

Keep pull requests focused. For a large feature or new runtime dependency, open an issue explaining the problem and proposed approach first. Follow [the code of conduct](CODE_OF_CONDUCT.md). Report security defects privately using [SECURITY.md](SECURITY.md), rather than a public issue.

Use the existing provider adapters, contracts, and test fixtures. Preserve upstream attribution, third-party notices, and the fork's independent app/data identity. Do not add upstream publishing targets, automatic updates, hosted service claims, or paid provider calls to a test.

## Development setup

Requires Node.js 24+ and pnpm 10.33.0. A provider CLI is needed for real chat, but fake-provider tests must not depend on a signed-in account.

```sh
git clone https://github.com/joewilsonai/grokoff.git
cd grokoff
pnpm install
pnpm dev:server
```

In another terminal run `pnpm dev`. With both servers running, `pnpm dev:desktop` launches Electron. Local Apple Silicon packaging uses `pnpm package:grokoff`; it downloads the pinned runtime helpers and does not publish artifacts.

The optional `apps/docs/` site and inherited npm/Linux publishing helpers are unadopted upstream tooling. They still contain upstream service links or package/update metadata; do not use them as GrokOff publishing instructions. This source alpha supports neither a docs-site deployment nor npm/Linux releases. See [UPSTREAM.md](UPSTREAM.md) for the retained paths and scope.

## Verification

Before claiming a server or conversation change works, follow [the isolated verification guide](docs/verification/README.md). Use a temporary app data directory, disposable workspace, and fake provider. Never point mutation checks at your live GrokOff data or another installed app. Do not copy credentials into a fixture or commit account data, tokens, local receipts, or private endpoints.

Run checks appropriate to the change:

```sh
pnpm lint
pnpm typecheck
pnpm i18n:check
pnpm check:electron
pnpm exec vitest run path/to/changed-module.test.ts
```

`pnpm test` runs the fork's scoped offline tests and packaged-server smoke. `pnpm test:core` runs just that selected regression set; `pnpm test:upstream` runs the much broader inherited suite. Passing the scoped checks does not establish that the entire inherited suite passes. Report the exact commands and results. Provider fakes under `server/testing/` must remain self-contained. Use observed events instead of sleeps, and keep provider prompts and paid calls out of automated checks.

The configured CI and its limits are documented in [docs/ci.md](docs/ci.md). A workflow file does not establish that a GitHub run has passed. Only claim a platform or workflow works when the PR includes relevant evidence. For UI changes, include an isolated screenshot or recording without private account data.

## Codebase map

| Path | Purpose |
| --- | --- |
| `server/contracts.ts`, `shared/` | Provider contracts and shared data types |
| `server/drivers/` | Provider adapters and scoped tool routing |
| `server/harness/` | Provider registration and event coordination |
| `server/index.ts` | Local HTTP API and event stream |
| `server/testing/` | Offline provider fakes and fixture helpers |
| `src/` | React interface |
| `electron/` | Desktop shell and native integrations |
| `docs/verification/` | Isolated workflow recipes |
| `third_party/` | Component provenance and license notices |

Build outputs such as `dist-server/` and `release-grokoff/` are generated. Do not hand-edit or commit them.

## Pull request checklist

- Explain the problem, resulting behavior, and relevant limitations.
- Include focused regression coverage where behavior or a security boundary changes.
- Record the final checks and isolated verification evidence.
- Preserve license, copyright, and attribution notices. Modified inherited files need a prominent GrokOff change notice; use an adjacent notice for formats that cannot carry comments.
- Leave user data, authentication, and other applications' state untouched.

Contributions to this community repository are submitted under Apache-2.0 unless an explicitly identified third-party component requires its own license. Submit only work you wrote or have the right to contribute. No CLA or DCO sign-off is required. The upstream enterprise code and its contributor agreement are not part of GrokOff's contribution process.
