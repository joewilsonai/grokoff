# Provider model and effort names

Verified October 8, 2026. GrokOff preserves provider model labels and routing IDs
instead of assigning its own names or model rankings. Simple and advanced views
use the same effort terminology: Low, Medium, High, Extra high, Max and, where
the selected Codex model offers it, Ultra.

## Catalog evidence

- Codex 0.153.2's authenticated `model/list` returned GPT-6-Astra,
  GPT-5.6-Sol, GPT-5.6-Terra and GPT-5.6-Luna in the maintainer verification environment. The first three
  reported low/medium/high/xhigh/max/ultra; Luna omitted ultra. GrokOff keeps
  the returned display names, effort descriptions and defaults. Availability
  can differ between Codex versions, accounts and the desktop app.
- GPT-6.1 Sol has been released, but it did not appear in this installed CLI's
  account catalog. Its release does not establish availability through this
  connection. No invented entry is added to the live catalog.
- Claude catalog labels follow the official families and versions, including
  Fable 5.1/5, Opus 5.5/5, Sonnet 5.5/5 and Haiku 5.5. Their supported effort
  choices are model metadata. Legacy Haiku 4.5 has no effort control. Model
  catalog membership alone does not establish plan eligibility or inclusion.
- The Grok driver naming audit found no label changes needed. Its API adapter
  does not advertise reasoning effort it cannot forward.

Sources checked:

- [Codex app-server model catalog](https://learn.chatgpt.com/docs/app-server)
- [Installed Codex model definitions](https://raw.githubusercontent.com/openai/codex/rust-v0.153.2/codex-rs/models-manager/models.json)
- [GPT-6.1 Sol release](https://openai.com/index/introducing-gpt-6-1-sol/)
- [Claude models](https://platform.claude.com/docs/en/models/overview)
- [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
- [Grok 4.7](https://docs.x.ai/developers/models/grok-4.7)

## Implementation and checks

Per-model effort metadata travels through provider discovery, startup cache,
HTTP snapshots and the renderer. An explicit empty effort list overrides the
account-level fallback. Selecting a model clears an effort it cannot accept.
The HTTP selection and turn paths reject unsupported efforts before dispatch.

The isolated actual-renderer preview used synthetic providers. It showed every
supported effort, including Ultra, at a 390 by 844 viewport; Ultra persisted
in the fixture bot selection across reload. These screenshots show a test
catalog, not a real OpenAI account's model availability:

- Narrow picker (private local record)
- Restored desktop header (private local record)
- Claude picker with all eight canonical model labels (private local record)

Verification receipts:

- 164 focused tests passed across model picker, provider naming, catalog cache,
  default selections and subscription billing copy.
- The Codex driver/catalog/cache pass reported 253 tests passed.
- Seven HTTP effort validation cases passed: six existing cases and a new
  isolated model metadata regression. This checks bot defaults, per-task
  overrides, explicit empty support, unsupported Ultra, rejected-write state
  preservation and workspace defaults. The test launcher now points explicitly
  to its disposable data directory.
- Seventeen usage-copy tests passed. Subscription cost captions no longer
  promise that provider-reported equivalents cannot correspond to a charge.
- Scoped lint and locale validation passed.
- Required static review: `model-names-code-review.json`, PASS, no findings.
  The reviewer explicitly did not run tests; the test evidence is separate.

Connection metadata independently showed both providers available and using
subscription authentication in the verification environment. These are login
checks; [live acceptance](subscription-live-acceptance.md) is recorded separately.
Private account details are omitted from the public summary.

The native arm64 candidate is built separately at
`release-grokoff/provider-names/mac-arm64/GrokOff.app`. Build, type checks and
packaging passed. Its packaged server started outside the repository with no
node_modules in reach. All 13 spawned proxies resolved; MCP initialized and
drained its final response, an encrypted backup exported, the container
launcher stopped cleanly, and the desktop entry started twice on its compiled
cache. The candidate is a local unsigned build, not a notarized release.
The final candidate also includes the Codex inherited-MCP parsing fix described
in the live acceptance report. Its packaged `Resources/server/index.js`
SHA-256 matches the final built server:
`a0b17ee7a491fcbf3c335230852503c82cc6e2c8671f9b08464afb6d00e748bd`.
Packaged UI index and bundled smol-toml license match their source artifacts.

## Publication note

This is a dated maintainer verification summary. Raw receipts, review transcripts,
account-specific metadata and screenshots remain in a private local archive and
are not distributed in the source repository. Historical local results do not
replace reproducible contributor checks or establish current provider availability.
