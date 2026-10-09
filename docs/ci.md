<!-- GrokOff modification (2026-10-08): replace upstream CI and release instructions with the fork's actual checks. -->
# GrokOff source checks

GrokOff is a source Mac alpha. [CI](../.github/workflows/ci.yml) runs two Ubuntu
jobs on pull requests, pushes to `main`, and manual dispatch. It uses Node 24,
pnpm 10.33.0 and the committed lockfile. It does not build or publish a Mac
release, deploy hosted services, or authenticate to model providers.

The source job runs lint, translation validation, syntax checks using Electron's Node
runtime, the UI build (which also typechecks frontend and server sources),
`pnpm test:core`, and `pnpm test:packaged-server`. Any failed command fails the
job. The packaged-server smoke stages the bundled server outside the checkout,
uses temporary data and home directories, and checks startup, bundled workers,
MCP, backup export, and shutdown without provider inference.

The docs job separately generates route types, typechecks the docs app, and
builds its pages, search index and Open Graph images with Next.js. This keeps
docs dependency patches covered by their actual build. The inherited docs
content still describes OpenMausBot; this check does not publish that site.

## Run the same checks locally

Use the Node version in [.nvmrc](../.nvmrc) and the pnpm version in
[package.json](../package.json). From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm i18n:check
pnpm check:electron
pnpm build
pnpm test
pnpm --filter @openmausbot/docs types:check
pnpm docs:build
```

`pnpm test` runs the maintained core suite and the bundled-server smoke. You
can run `pnpm test:core` alone while working on a relevant unit or renderer
change. Tests redirect their data into disposable homes; follow the
[verification guide](verification/README.md) for interactive mutation checks.
Do not aim those checks at your running personal workspace.

## Coverage and limits

`test:core` runs complete selected test files for configuration and request
authorization, Claude/Codex driver contracts and subscription billing guards,
Grok API behavior and model catalog, startup/default model selection, model
names and selection, pairing links, disabled analytics and hosted offers,
independent application identity, lazy phone-secret/cancellation behavior,
Markdown report previews and message-scoped file access, browser turn
cancellation, an isolated HTTP browser Stop integration, and real Markdown
math rendering with resource/trust regressions for the direct and transitive
KaTeX entry points. Mermaid math output and font/layout checks use the separate
disposable [math renderer fixture](verification/math-renderer.md).
Provider transports use fake CLIs or stubbed fetch responses. The exact file
list is in `package.json`; it is not the entire inherited test suite. The
inherited CI retry runner can retry only listed known flakes; the workflow
reports any retries in its job summary.

The original broad command remains available as `pnpm test:upstream` for
maintainer adoption work. It currently includes tests for excluded enterprise
source and removed upstream Docker/release workflows, and it is not the
contributor or PR gate. Adopt those fixtures deliberately when their features
enter the fork's supported scope; do not restore hosted deployment automation
merely to make historical workflow assertions pass. The broader conversation,
routines, integrations and desktop suites also need a maintained fork baseline
before CI can claim their coverage.

Portable CI does not prove macOS Accessibility or Screen Recording, voice,
real browser control, live provider account behavior, Intel Mac support, or a
clean native build on another contributor's Mac. Apple Silicon packaging is
manual with `pnpm package:grokoff`; it downloads pinned native helpers and
requires Xcode command-line tools. Its output is an unsigned local `.app`,
with publishing disabled. A GitHub source-check success is not native release
acceptance; retain the [verification evidence](../research/verification.md).

## Workflow maintenance

Workflow permissions are read-only, checkout does not retain its token, and
actions are pinned to reviewed commit SHAs. Pins were verified against the
official releases on 2026-10-08: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0),
and [pnpm action-setup v4.2.0](https://github.com/pnpm/action-setup/releases/tag/v4.2.0).
When updating a pin, confirm the tag's commit in the official repository.
`scripts/ci-workflow.test.ts` checks every workflow for privileged triggers,
write scopes, secret access, persistent checkout credentials, unreviewed
actions, and publishing commands. Repository branch protection and private
vulnerability reporting are separate GitHub settings; these files do not
enable them.
