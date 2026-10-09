# GrokOff roadmap

GrokOff is a Mac source alpha built on OpenMausBot's community edition. This roadmap describes intended milestones, not shipped features or promised dates. [Verification](research/verification.md) records what has actually been checked.

## Browser to finished report

The next milestone is one repeatable task through the real desktop interface: a bot researches in the browser and produces a finished report with traceable sources. Progress must stay visible, Allow/Deny/Stop must work, the completed artifact must open from the conversation, and the result must persist after an app restart.

The current source adds an in-app Markdown report reader and cancellation of in-flight browser work. Bounded live Claude and Codex tasks have each read controlled pages through the native browser, saved a sourced report and returned a working conversation file link. See the [dated evidence and limits](research/browser-report-2026-10-08.md) and [repeatable desktop recipe](docs/verification/browser-report.md).

Full packaged-app acceptance with a live provider, browser UI navigation and saved-login continuity remain before calling the whole milestone complete. The controlled-source and deterministic desktop checks establish narrower behavior.

Memory continuity follows this milestone: verify explicit preference capture, useful recall, and restart behavior without silently importing another application's state.

## Make the alpha usable

- Make setup, connection status, provider model/effort choices, and errors understandable without inspecting logs.
- Turn representative memory, routines, group delegation, browser, and file tasks into isolated regression recipes.
- Document account sharing, permissions, provider limits, and data export clearly.

## Prepare a binary release

Resolve retained mascot/trademark branding, finish the bundled-component license inventory, verify clean-install/update behavior, and establish a signing/notarization and release process owned by this project. Publish checksums and platform-specific acceptance evidence with any future binary release.

Always-on cloud execution, mobile clients, and additional hosted integrations are later design candidates. They require separate scope, authentication, infrastructure, and verification; this source alpha does not supply them.

## Research reference

The preserved [Grok Bot, OpenAI dots, and Meta Muse comparison](research/grok-dots-muse-comparison-2026-10-08.md) informs a possible “best of all three” direction: standing specialists, continuity from research to code, and editable personalization. These are design candidates, not committed features. The report's product claims have not been independently audited; dated availability, pricing, and capabilities need verification before they become requirements. See [its provenance and evidence limits](research/grok-dots-muse-comparison-2026-10-08.provenance.md).
