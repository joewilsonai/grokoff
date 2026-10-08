# Grok Bot product research

Research date: October 8, 2026. Researcher: Elle. Scope: the Grok Bot agent product at `x.ai/bot`, rather than the ordinary Grok chatbot or the `@grok` account on X.

## Evidence boundary

This primary-source review describes **published behavior**. No authenticated Grok Bot session, local app screen, paid job, or benchmark was exercised. Public documentation provides concrete implementation and limit information; it does not establish feature reliability for every account.

The newest inspected release notes list **v0.68.1, October 7, 2026**. Release notes sometimes contradict newer-dated documentation, so differences are recorded below rather than silently resolved. [Official changelog](https://x.ai/changelog/bot)

## What the product is

The product centers on durable named teammates rather than disposable chats. They combine persistent role context, an execution environment, connected tools, background work, and coordination. Setup starts with a job description and access grants. The user can type, dictate, or talk; the bot carries a task across applications and returns results or requests intervention. Work continues when client devices close. [Overview](https://docs.x.ai/grok-bot/overview)

**Research interpretation:** the replicable product is an orchestration and interaction layer around capable models and computer automation. Its value proposition is reduced supervision and preserved context. A Mac chat interface by itself would reproduce only a small portion of the experience.

## Published feature matrix

| Area | Published behavior | Primary evidence |
|---|---|---|
| Onboarding | Desktop installation, Cursor-account browser authentication, optional SuperGrok subscription linking, initial tour, tool preferences, background computer provisioning, and a suggested first teammate. Tool preferences do not themselves authorize or modify integrations. Dictation and live voice are first-class input paths. | [Getting started](https://docs.x.ai/grok-bot/get-started) |
| Bot identity | Profile fields include name, label, description, and avatar. A bot maintains one enduring role and conversation. Standing rules belong in its description; individual messages supply task instructions. Bots can suggest or create specialists. | [Bot management](https://docs.x.ai/grok-bot/bots) |
| Bot lifecycle | Pin, hide/unhide, duplicate, share, import, delete. Hiding does not suspend work. Duplication retains configuration, skills, routines, and avatar, while omitting learned memory, conversation, and attachments. Deletion removes active bot/chat/routines but can leave shared files and sign-ins. | [Bot management](https://docs.x.ai/grok-bot/bots) |
| Memory | Stable preferences, important facts, role context, and work summaries can persist. Personal bots keep separate conversations and learned context. Shared files, handoffs, and group messages transfer selected context. Documentation advises reopening authoritative sources for consequential decisions; this is memory, not a guarantee of accurate current facts. | [FAQ](https://docs.x.ai/grok-bot/faq) |
| Messaging | Text, pasted links/images, attachments, dictation, live voice, voice memos, mentions, replies, reactions, and instructions sent during execution. Tool activity and results share the conversation timeline. A direct instruction can redirect background work; stopping does not undo completed actions. | [Messaging and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration) |
| Group collaboration | Groups contain two to six bots. Mentions and replies target owners; otherwise participants choose who responds. Bots asynchronously message one another and wake recipients. Group bot handoffs are text-only; images should be sent directly. Group transcripts omit approval, secret/login, and email/Slack draft requests, although questions/forms and files can appear. | [Messaging and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration) |
| Cloud computer | One persistent account-level computer shares cookies, signed-in sessions, command credentials, and files across personal bots. Each bot has its own screen, allowing parallel desktop work; an individual screen handles one computer-use task at a time. Separate screens provide working surfaces rather than security isolation. | [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) |
| Watching and takeover | A user opens the agent desktop to observe clicks/navigation or take control for blocked steps. Passwords, 2FA, CAPTCHAs, and identity/payment checks can require human intervention. Browser sessions persist, but websites can expire or block them. | [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) |
| Durable files and recovery | `/workspace` holds shared project files. Recovery/update preserve durable files and supported logins; reset restores a snapshot and can lose recent changes. Temporary directories and manually installed packages should be treated as replaceable. Local command execution is a separate enabled capability. | [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) |
| Connectors and MCP | Structured connectors are preferable where available; UI automation covers unsupported services or visual workflows. The official introductory guide says Cursor-compatible MCP servers, plugins, and skills are supported, with multiple accounts per service, including Gmail, Calendar, Drive, and Slack examples. | [Grok Bot 101](https://x.ai/bot/guides/grok-bot-101) |
| Plugin controls | Installed plugins and private skills can be managed together; individual tools can be disabled. Plugins may require separate browser authorization. Model selection is managed by Cursor, with no user model picker. Personal rules and local execution settings can depend on the desktop installation. | [Settings](https://docs.x.ai/grok-bot/settings-and-notifications) |
| Skills | Skills store a reusable method: inputs, steps, decision rules, validation, output, and boundaries. Private skills form one account-wide library. Skills do not themselves schedule work, and required connector/logins still have to exist. | [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| Teaching | When enabled, the user demonstrates a browser task from the bot computer. Recording lasts at most ten minutes and excludes microphone audio. The generated skill is a reviewable draft. Availability rolls out gradually. | [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| Routines and events | One bot owns each schedule/event workflow. Setup includes timezone, sources, output, and failure/approval rules. A bot can own 50 routines; schedules are at least five minutes apart; each retains 20 recent runs. Enable/pause, edit, test, and delete controls exist. A test executes real work. Long inactivity can cause unattended routines to pause. Slack/GitHub event integrations are distinct from their ordinary plugins. | [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| Proactivity and recent UI | A starred primary bot can suggest work. Recent changes include slide-deck outputs, formatted email drafts, 1920×1200 desktops, secure checkout forms, and faster stop handling. Connect Apps replaces Marketplace in the client; slash no longer opens the skill/action menu. Team bot managers can maintain setup; draft cards can disable mandatory drafting per bot. | [Changelog](https://x.ai/changelog/bot) |
| Approval requests | Proposed actions expose their inputs and scope. One-time approval, saved permission, and refusal are available. User-started review waits for a response; unattended review cards expire after roughly ten minutes without executing. Secure secret requests mask values, exclude them from transcripts, and withhold them from the model. Hardware-key bridging requires approval. | [Approvals and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) |
| Auto Review | A distinct model evaluates shell, connector, computer, automation-write, and delegation actions before execution. It can approve, deny, or escalate. Asking rules override allowing rules. It is model-based, not complete side-effect enforcement; memory writes and most settings changes are outside its review coverage. | [Security](https://docs.x.ai/grok-bot/security), [Security FAQ](https://docs.x.ai/grok-bot/security-faq) |
| Local permissions | Local execution defaults to per-command approval and can be allowed or denied separately from cloud work. Administrative ceilings can tighten the setting. Traffic can optionally route through the current desktop to use its network/IP; this is separate from local command permission. | [Approvals and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy), [Settings](https://docs.x.ai/grok-bot/settings-and-notifications) |
| Data handling | Cursor authentication/data settings apply. Cloud storage is required, so Legacy Privacy Mode is unsupported. Training opt-out follows the account policy. Shared access survives deletion of an individual bot. | [Approvals and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) |
| Files and deliverables | Inputs include common document, media, tabular, code, email, and notebook formats. Desktop accepts six attachments at once; ordinary files can be 25 MB, videos 200 MB. Result cards preview supported files and allow saving. Delegated coding results can include images/videos copied back from the coding agent. | [Files and results](https://docs.x.ai/grok-bot/files-and-results) |
| Coding delegation | Bots can create Cursor Cloud Agents, monitor transcripts/artifacts, queue steering instructions, interrupt runs, and inspect visual proofs. Private worker machines can provide special environments such as iOS Simulator or VPN access. The engineering guide describes multi-agent management and scheduled PR/CI review loops; these are authored workflows, not a guaranteed built-in autonomous engineering system. | [Engineering guide](https://x.ai/bot/guides/grok-bot-for-engineering) |
| Teams | Team Bots share configuration, skills, reference files, service credentials, and explicitly shared team memory. Each person gets private conversation/notes. OAuth uses the requesting person; token-based connectors can use a common service credential. App chats and Slack DMs execute on that person's computer; shared Slack conversations use a separate bot computer. Routines remain personal. Shared conversations request permission before using personal connectors. | [Team Bots](https://docs.x.ai/grok-bot/team-bots) |
| Team bot secrets and Slack | Up to 25 secrets, with values 8–4096 bytes, are encrypted and redacted from model-facing outputs. Team bot Slack apps answer DMs and mentions, then follow threads. Published bots are discoverable by teammates. Documents say owners maintain setup; release notes add managers. In some unattended contexts review may be disabled unless enforced by the team. | [Team Bots](https://docs.x.ai/grok-bot/team-bots), [Changelog](https://x.ai/changelog/bot) |
| Templates and sharing | Sharing installs a recipe on another account, not access to the original computer or conversations. Public/team-only visibility, preview, and update paths exist. The template guide describes selected memories/instructions/skills/plugins, with personal material filtered; custom scripts/code and nonstandard MCP components require separate setup. The user should inspect the package before sharing or installation. | [Template guide](https://x.ai/bot/guides/templates-for-grok-bot) |
| Mobile and remote | macOS, Windows, Linux, iOS, and Android clients reach the cloud runtime. Mobile syncs bots, chats, routines, connectors, and computer access. It supports voice, photos/files, group participation, takeover, search, draft cards, routine pause/resume/history, and notifications. Editing/testing routines and some teaching/advanced controls require desktop. iOS sharing accepts multiple content types; Android sharing currently accepts text. | [Mobile](https://docs.x.ai/grok-bot/mobile) |
| Status and notifications | The roster distinguishes ongoing work, unread results, and requests needing attention. Per-bot notifications report completion/input needs, with focused-client suppression. Search locates bots/groups/messages/files/routines and jumps to their conversation context. Appearance, languages, accounts, timezone, usage, and separate client/computer updates are settings surfaces. | [Settings](https://docs.x.ai/grok-bot/settings-and-notifications) |
| X entry point | Tagging `@bot` can pass a post/reply, parents/quotes, and still images to the user's main bot. A public confirmation is posted, while work/results remain in the private bot conversation. Account linking and regional eligibility apply. GIF/video, certain account regions, moderation, usage exhaustion, and simultaneous `@grok` tags can prevent forwarding. This entry point does not require the X plugin. | [Tag on X](https://docs.x.ai/grok-bot/tag-on-x) |
| Enterprise controls | Cursor identity, account policy, and existing Cloud Agent controls carry through. Published controls include group access, connector policy, team rules, local-execution ceilings, network destinations, managed computer setup, secrets, and opt-in action/content telemetry. User computers are Firecracker microVMs. Subagent launches appear explicitly in logging and review coverage. | [Teams and enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) |

## Design lessons visible in first-party material

The official design account defines five core objects: bots, chats, prompts, tools, and artifacts. Persistent bots organize the sidebar; profile and animated state help a growing roster remain legible. Computer access has three levels: lightweight activity indication, preview, and full takeover. The transcript combines prose with widgets and operational events. Skills/tools are shared capabilities, while memory/routines belong to roles. Groups expose cross-role work without requiring a manual assignment board. The designers report practical limits of about 50 bots per account and six per group. [Design article](https://x.ai/news/designing-grok-bot)

**GrokOff inference:** retaining this delegation model matters more than reproducing their cartoon avatars. A coherent roster, live status, reviewable artifacts, reversible control, and quiet background execution form the central interaction contract.

## Documentation conflicts and limits

| Conflict | Treatment for a clone specification |
|---|---|
| Skills docs describe a slash menu; newest release removes it. | Keep skill invocation as a product capability; do not claim the current UI still uses that menu. |
| Docs say Marketplace and owner-only Team Bot setup; releases say Connect Apps and managers. | Use fresh release terminology and multi-maintainer requirements. |
| Older design copy says each bot has its own computer. | Detailed computer/security docs establish account-shared compute with separate screens. |
| Template guide suggests privacy filtering; sharing docs warn public packages expose configuration. | Treat review/redaction as required product work; automatic anonymization is not a proven guarantee. |
| Some Team Bot contexts lack a responder; Slack now has review cards. | Model approval destinations explicitly; do not silently disable review in GrokOff. |

The conflict table reconciles the sources cited beside the corresponding feature rows; it does not establish which rollout Joe's installation has.

Published limitations include blocked websites, repeated authentication, datacenter-IP rejection, finite context, shared personal-bot credentials, mutable memory, attachment limits, gradual feature rollout, subscription limits, and possible snapshot loss. Dedicated customer egress IPs, connector auto-provisioning, and dedicated DLP hooks are not advertised as available. Blocking an MCP connector alone does not block browser access to its service. [Security FAQ](https://docs.x.ai/grok-bot/security-faq), [Security](https://docs.x.ai/grok-bot/security)

Recovery guidance prioritizes retry, client restart, recover, computer update, then reset. Cloud work can continue despite client disconnection. Routines can fail because of access, source, schedule, computer, or usage state. Updates to the app and computer are separate. [Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)

## Open questions requiring implementation evidence or product decisions

- The exact model lineup, routing policy, hidden prompting, memory extraction/retrieval implementation, agent loop, scheduler delivery guarantees, and screen-sharing protocol are not established by this product review.
- No public Grok Bot server implementation or end-user Bot-control API was identified in the reviewed pages. The site links an ordinary xAI model API; that is not evidence of an API for administering the Bot product.
- Whether GrokOff executes locally, in a sandbox/VM, or on a hosted machine determines sleeping-laptop behavior, integration reliability, and operational cost. A local-only app cannot honestly promise always-on work while its Mac sleeps.
- Functional parity should be divided into personal-bot essentials, cloud/remote execution, and team/enterprise layers. Team Bots, private workers, X forwarding, payment forms, and managed telemetry increase scope substantially.
- Usable acceptance evidence should cover task completion, safe interruption, browser/connector handoffs, persistent logins, memory corrections, schedule recovery, artifact retrieval, and independent concurrent bots. Visual resemblance is insufficient.

## Source matrix and freshness

| Source | Type | Published/update date inspected |
|---|---|---|
| [Product landing page](https://x.ai/bot) | Marketing/availability | Live page October 8 |
| [Overview](https://docs.x.ai/grok-bot/overview) | Reference | October 7 |
| [Getting started](https://docs.x.ai/grok-bot/get-started) | Reference | September 21 |
| [Bot management](https://docs.x.ai/grok-bot/bots) | Reference | October 6 |
| [Messaging](https://docs.x.ai/grok-bot/chat-and-collaboration) | Reference | Live page October 8 |
| [Files](https://docs.x.ai/grok-bot/files-and-results) | Reference | October 3 |
| [Computer](https://docs.x.ai/grok-bot/computer-and-apps) | Reference | September 14 |
| [Skills/routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) | Reference | October 6 |
| [Settings](https://docs.x.ai/grok-bot/settings-and-notifications) | Reference | October 6 |
| [Approvals](https://docs.x.ai/grok-bot/approvals-security-and-privacy) | Reference | October 6 |
| [Mobile](https://docs.x.ai/grok-bot/mobile) | Reference | October 6 |
| [Tag on X](https://docs.x.ai/grok-bot/tag-on-x) | Reference | October 7 |
| [Team Bots](https://docs.x.ai/grok-bot/team-bots) | Reference | Live page October 8 |
| [Enterprise](https://docs.x.ai/grok-bot/teams-and-enterprises) | Reference | Live page October 8 |
| [Security](https://docs.x.ai/grok-bot/security) and [FAQ](https://docs.x.ai/grok-bot/security-faq) | Reference | Live pages October 8 |
| [General FAQ](https://docs.x.ai/grok-bot/faq) | Reference | September 29 |
| [Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting) | Reference | October 7 |
| [Changelog](https://x.ai/changelog/bot) | Versioned first-party releases | Latest October 7, v0.68.1 |
| [Design article](https://x.ai/news/designing-grok-bot) | First-party design rationale | September 3 |
| [Grok Bot 101](https://x.ai/bot/guides/grok-bot-101) | First-party example | September 11 |
| [Engineering](https://x.ai/bot/guides/grok-bot-for-engineering) | First-party example | September 10 |
| [Templates](https://x.ai/bot/guides/templates-for-grok-bot) | First-party example | Live page October 8 |

Also inspected: [launch](https://x.ai/news/introducing-grok-bot), [plan expansion](https://x.ai/news/grok-bot-more-plans), [X connector](https://x.ai/news/grok-bot-and-x), [Team Bots announcement](https://x.ai/news/team-bots).
