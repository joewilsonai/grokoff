# GrokOff roadmap

GrokOff is a Mac source alpha built on OpenMausBot's community edition. This roadmap describes intended milestones, not shipped features or promised dates. [Verification](research/verification.md) records what has actually been checked.

The [October 9 integration record](research/verification-2026-10-09.md) reports the locally combined changes, isolated desktop checks and remaining release requirements. Its bounded fixtures do not complete the live-provider desktop milestone below.

## Browser to finished report

The next milestone is one repeatable task through the real desktop interface: a bot researches in the browser and produces a finished report with traceable sources. Progress must stay visible, Allow/Deny/Stop must work, the completed artifact must open from the conversation, and the result must persist after an app restart.

Pixel has already produced a sourced comparison file using search and shell tools, and the bounded subscription checks demonstrate tool reads and completed replies. These are narrow workflow successes. Browser UI navigation, saved-login continuity, and the desktop artifact experience still need acceptance before claiming this milestone is complete.

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
