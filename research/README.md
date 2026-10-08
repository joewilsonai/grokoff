# GrokOff research and first Mac build

Research date: October 8, 2026. Prepared by Elle for Joe Wilson.

Grok Bot combines durable named bots, tool execution, memory, approvals,
shared files and a persistent cloud computer. Recreating the useful workflow
requires an agent coordinator and execution environment as well as a chat UI.
The published cloud design uses one Firecracker microVM per account with
separate working screens for bots. The exact prompts, retrieval algorithms,
model-serving mix and implementation are proprietary and not publicly established.

## Read the investigation

- [Product behavior and current feature matrix](product-research.md)
- [Documented architecture and independent reconstruction](architecture-research.md)
- [Mac feasibility, reusable projects and licensing](mac-feasibility.md)
- [Applied design](../docs/design/2026-10-08-grokoff-design.md)
- [Fork security boundaries](../docs/design/fork-security.md)
- [Source provenance and licenses](../UPSTREAM.md)
- [Verification and actual build status](verification.md)
- [Pixel's Grok Bot, OpenAI dots and Meta Muse comparison](grok-dots-muse-comparison-2026-10-08.md)

Primary evidence comes from the [official overview](https://docs.x.ai/grok-bot/overview),
[security documentation](https://docs.x.ai/grok-bot/security),
[computer documentation](https://docs.x.ai/grok-bot/computer-and-apps) and
[October 7 changelog](https://x.ai/changelog/bot). The reports link each detailed claim
and distinguish documented behavior, inspected source and architectural inference.

## Product synthesis reference

Joe asked on October 8, 2026 to retain Pixel's comparison as possible input for
making GrokOff the "best of all three worlds." The report is preserved verbatim
in this folder, independently of its original bot chat workspace. Candidate ideas
include Grok's standing specialists and routines, dots' research-to-code continuity,
and Muse's editable personalization and personal/business workflows. These are
design candidates, not a committed feature list. See the [provenance note](grok-dots-muse-comparison-2026-10-08.provenance.md)
for the original location and evidence limits; the report's claims still require
independent source review before they become product requirements.

## Reuse decision

GrokOff adapts the Apache-2.0 community edition of
[OpenMausBot](https://github.com/milind-soni/OpenMausBot) at
`3e9e42b3a05e0b7c4edbaedba2e667b851296e27`.
It already supplies the Electron/React shell, structured provider adapters,
persistent bot/task coordinator, approvals, browser tooling, skills, memory,
routines and conversations. The separately licensed enterprise folder is excluded.
Other assessed projects include Cua, Hermes, OpenHands, Letta Code, Eidon and
Munder Difflin; their license and runtime differences are in the Mac report.

GrokOff has its own name, GO icon, profile, workspace and permissions identity.
Inherited vendor telemetry, hosted account defaults and update feeds are disabled.
The first edition executes locally and needs an awake Mac. Always-on cloud work,
enterprise access and demonstrated-workflow teaching need additional implementation
and verification. A local package or simulated response does not establish full parity.
