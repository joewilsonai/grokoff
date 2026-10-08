Grok Bot, OpenAI dots, and Meta Muse
Product comparison checked October 8, 2026

**My assessment: Grok Bot is the strongest documented fit for managing a team of operational agents; dots for sustained research and software work across the OpenAI ecosystem; Muse for a personal assistant that also handles social and small-business work.** None has enough comparable evidence here to earn an overall reliability or intelligence crown.

This report compares the actual agent products. It does not automatically transfer features from Grok chat, every ChatGPT tool, Meta AI, Muse Code, or Meta’s image/video models into the corresponding agent. “Strongest” means the best fit supported by current product documentation. This is a current-source product assessment, not a hands-on test or a measurement of successful task completion. Recommendations below are my analysis.

**What is current, and what is still rolling out**

| Product | Current baseline | Important qualification |
|---|---|---|
| Grok Bot | v0.68.1, October 7: slide-deck collaboration, formatted email, faster computer interaction and recovery improvements. | A numbered client release does not establish availability of every server-side feature. Teach-by-demonstration remains a gradual rollout. |
| OpenAI dots | Launched September 29; current Help Center documentation checked October 8. | Access is gradual. One primary dot is the launch product; cooperating teams of dots remain a future vision, while specialist organizational dots are in focused pilots. |
| Meta Muse | September 8 launch; Small Business expansion announced September 29 and its article updated October 8. Mac support is current. | Some voice/avatar demonstrations, future devices and privacy features should not be treated as universally available. |

Sources: [Grok changelog](https://x.ai/changelog/bot), [Grok skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations), [dots launch](https://openai.com/index/introducing-dots/), [dots access](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot), [Muse Small Business](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Muse downloads](https://ai.meta.com/muse/download/).

**The practical differences**

| Need | Grok Bot | OpenAI dots | Meta Muse |
|---|---|---|---|
| Several standing specialists | Named personal Bots, handoffs and centrally managed Team Bots are established product concepts. | One primary dot can delegate to background agents. That differs from a generally available team of separately configured dots. | One personal Muse can coordinate concurrent work and subagents; a comparable governed shared-team product was not established in reviewed sources. |
| Work while your laptop is closed | Persistent cloud computer. | Persistent cloud computer. | Persistent cloud computer. |
| Software and technical projects | Shell/browser work, GitHub operations and Cloud Agent delegation. | Explicit integration with Codex tasks and ChatGPT Work makes this its clearest specialization. | Can create code, scripts and interactive tools, but that alone does not establish an equivalent engineering workflow. |
| Routine operations | Scheduled/event-triggered routines with testing and run history. | Recurring tasks, supported integration triggers and proactive research. | Goals, scheduled tasks, proactive suggestions and connector updates. |
| Social and commerce | Public X research, connected apps and browser execution. | Broad plugin-based work, with action coverage depending on the connection. | First-party Meta business context, shopping and a growing set of commerce/design/accounting connections. |
| Personal memory | Standing Bot contexts; shared computer resources must be considered separately. | Persistent context, but individual dot memories cannot currently be inspected, edited or selectively deleted. | Editable memory/personality files and data export; selective forgetting still has caveats. |
| Main design tradeoff | Powerful coordination with coarse separation between personal Bots. | Strong work coordination with weak granular memory control. | Accessible personal/business assistance with incomplete public evidence of team governance. |

This table synthesizes the product-specific evidence discussed below. It is a workflow-fit comparison, not a feature-count score.

**Grok Bot: the strongest choice for an operational bot team**

Grok’s advantage is the combination of multiple specialists, persistent execution and reusable procedures. A Team Bot has centrally maintained configuration and shared reference material, while keeping private conversations and per-person notes. OAuth connections use the requesting person’s identity; API-key connections can use a shared Bot credential. Managers can maintain the Bot, and Slack provides another work surface. That is a concrete foundation for a research specialist, an operations specialist and a technical specialist serving the same business. [Team Bots documentation](https://docs.x.ai/grok-bot/team-bots)

Its computer supplies browser, shell and durable working files, with public X reading/search available without connecting an account. Separate Bot screens support parallel work. The benefit is less repeated setup and easier handoff between specialists. The cost is that personal Bots share files, browser sessions and command-line credentials. Separate names and screens are not separate security boundaries. This is its most consequential architectural tradeoff for people mixing clients, businesses or personal accounts. [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)

The current artifact workflow also matters. Grok accepts common office/data/media files, can delegate coding and return files to the conversation, and now supports choosing sample slides before delivering PowerPoint or Google Slides. The latest release reports fixes for stalled pages, uploads and crashed tabs. These are evidence of current engineering priorities and claimed fixes—not proof those bugs remain or that recovery is now flawless. [Files and results](https://docs.x.ai/grok-bot/files-and-results), [October 7 release](https://x.ai/changelog/bot)

Its automation controls are useful but bounded: up to 50 routines per Bot, a minimum five-minute schedule spacing, and only 20 recent run records per routine. Team Bot routines belong to individuals rather than the team. Those limits complicate long-term reporting and ownership when a staff member leaves. [Routines](https://docs.x.ai/grok-bot/skills-routines-and-automations), [Team Bot ownership](https://docs.x.ai/grok-bot/team-bots)

Cost and administrative control are another weakness. The enterprise guide documents no separate Grok Bot spending cap; account-level controls apply. Network restrictions, enforced review policies and richer action logging depend on Enterprise. Self-serve Teams does not provide all the same controls. My interpretation: Grok is better equipped for an operational team than its peers, but a small business still cannot assume it gets the full governance package. [Teams and enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

Mobile is good for supervision: iOS and Android support conversation, voice, approvals and cloud-computer takeover. Important routine editing and testing still require desktop, and Android sharing is more limited. That makes it useful from a phone without making the phone a complete administration console. [Mobile documentation](https://docs.x.ai/grok-bot/mobile)

**What Grok should improve, in priority order:**

1. **Optional isolation per Bot or project.** Separate browser profiles, folders and credential scopes, with explicit sharing when collaboration is intended.
2. **Budgets per Bot and routine.** Show predicted cost, consumed allowance and a final cost receipt; allow a dedicated product cap.
3. **Team-owned automation.** Transfer ownership, retain/export longer histories and resume partial work without duplicating external actions.
4. **Complete mobile administration.** Routine editing/testing should work wherever approvals do.
5. **Versioned capability documentation.** Link each feature to supported platform, plan and rollout state. Current docs still contain obsolete slash-menu instructions after the changelog removed that menu.

Best-fit example: a recurring operating review that gathers business signals, assigns investigations to specialists, produces a deck and hands a software fix to a coding agent. This is a proposed workflow, not one tested for this report.

**OpenAI dots: the strongest fit for sustained research and engineering coordination**

Dots is most persuasive as a persistent coordinator for work already spread across ChatGPT Work, Codex and connected services. It can delegate parallel tasks, create task threads, resume work and continue existing local Codex tasks. Scheduled work and supported integration events extend that coordination beyond a single conversation. Its potential advantage is carrying context from a question through analysis, implementation and follow-up. That is a product integration advantage; it is not proof of superior code quality. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory)

Its cloud environment retains files, installed software and browser state. Local work is also supported, but only one personal computer can be connected at a time, and that machine must remain online with ChatGPT open. Delegating coding to Codex Cloud requires a previously configured Codex environment. These boundaries matter when work depends on a particular desktop app or local project. [Computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps)

OpenAI advertises more than 4,000 app connections. I would interpret that as potential reach rather than assume equal capability: an integration may expose reading, writing, a few actions or a much fuller workflow. The launch also distinguishes today’s primary dot from future teams of dots and narrower organizational pilots. Internal subagents should not be counted as equivalent to Grok’s existing user-managed Bot team. [dots announcement](https://openai.com/index/introducing-dots/)

The sharpest weakness is memory. Current documentation says users cannot view, directly modify or selectively delete individual dot memories. Deleting the entire dot clears its own context, while disconnecting a service merely ends new access. Previously absorbed information can remain. For a long-lived assistant, an incorrect assumption can therefore be harder to audit and surgically remove than it should be. [Privacy FAQ](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs)

Stopping work is also fragmented. Pause stops the primary task; delegated tasks and recurring schedules need separate attention. Activity and Scheduled views make them visible, but a user should not have to understand the task hierarchy to stop all related work. Proactive research is intentionally more restricted: it cannot directly send messages, change plugin content or control a browser/computer. This constrains unsolicited action; it does not mean authorized recurring work cannot act. [Control your dot](https://learn.chatgpt.com/docs/dots/controls)

Its channels support continuity across ChatGPT, Slack, Teams and voice, with separate visible histories and permission boundaries. However, a dot cannot initiate calls at launch. Texting is a limited beta for some US Pro users in newer Help Center guidance, while the channel guide still calls it forthcoming. That inconsistency deserves correction, and texting should not be presented as general availability. [Channels](https://learn.chatgpt.com/docs/dots/channels), [Current getting-started FAQ](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot)

**What OpenAI should improve, in priority order:**

1. **A memory inspector with real correction and deletion.** Include provenance, source-specific forgetting, export and a way to repair one fact without replacing the entire assistant.
2. **A dependable stop-everything control.** Display exactly which tasks and future schedules will stop.
3. **Transparent work economics.** Expose remaining deeper-work capacity and explain which delegated tasks draw from Work or Codex.
4. **Simpler environment management.** Make local/cloud location, required setup, inherited permissions and blockers visible together.
5. **Finish the collaboration and communication product.** Clearly label pilots and limited betas, then deliver the promised team and outbound communication capabilities with appropriate controls.

Best-fit example: monitor a product issue, investigate it against documentation and customer history, delegate a code change, review the result and update the ongoing project. The advantage I see is continuity through that chain, not a verified success-rate lead.

**Meta Muse: the strongest fit for personal assistance and Meta-centered small-business work**

Muse combines persistent personal goals, side conversations, concurrent tasks, proactive ideas and interactive artifacts. This gives it a coherent personal-assistant experience: a person can keep working on a goal while assigning unrelated errands and checking results later. Its design documentation emphasizes helping the user organize attention, not just receiving prompts. [How Muse was designed](https://introducing.muse.ai/)

The Small Business expansion connects Instagram professional analytics, Facebook Pages and Meta ads with tools including Shopify, Stripe, QuickBooks, Canva and Figma. My assessment: this is a persuasive combination for a solo operator moving from performance analysis to campaign creation. Actual action coverage still depends on each connector. [Small Business update](https://about.fb.com/news/2026/09/introducing-muse-small-business/)

Consumer commerce is another area where the product is specific: price watches, comparison shopping, Marketplace buying/selling and returns are documented use cases, with purchase approval and one-time payment credentials. These are more focused workflows than a generic claim that an agent can browse. [Shopping capabilities](https://ai.meta.com/muse/shopping/)

Muse also documents actual artifact creation: office documents, spreadsheets, images, code and interactive browser tools. Native image generation and editing are supported; Canva or Figma are separate integrations. That does not establish professional video-editing quality or prove that every capability of Meta’s Muse Image/Video models is available inside this agent. [Artifacts and creation](https://www.meta.com/help/artificial-intelligence/2074655449783957/)

Its Mac integration can work with local files and apps such as Messages, Notes, Reminders, Mail and Calendar. Per-app modes include off, read-only and read-and-interact. Local access can be broad and can involve screenshots; it should not be mistaken for on-device-only processing. Mobile, web and WhatsApp offer other ways to reach the agent. [Mac capabilities and permissions](https://www.meta.com/help/artificial-intelligence/1126304576638594/), [Downloads](https://ai.meta.com/muse/download/)

Muse provides much better documented inspectability than dots: editable memory, personality and identity files, plus export. The important limit is that deleting a message or file may leave learned information elsewhere, and its forget procedure is best effort. Model-training permission starts enabled, although the user can disable it. Those facts make its controls valuable without making selective deletion guaranteed. [Data controls](https://www.meta.com/help/artificial-intelligence/2225571704857152/)

Its published security architecture is unusually concrete: a separate Sentinel authorizes outside-world actions, credentials are separated from the main agent, and the execution environment is isolated. But today’s Secure VM still permits necessary provider access. Confidential VM—intended to prevent Meta access cryptographically—is planned, not established as generally shipped. This is a meaningful distinction between current protection and promised privacy. [Security architecture](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)

Organizational governance remains an evidence gap: I did not establish a shared-team model with roles, offboarding and centrally controlled memory. Small Business adds capabilities inside personal Muse. The separate Enterprise Platform announcement does not demonstrate that a full Muse administration product has shipped. [Small Business scope](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Enterprise Platform announcement](https://about.fb.com/news/2026/09/launching-meta-enterprise-platform/)

**What Meta should improve, in priority order:**

1. **Ship and independently audit Confidential VM.** Clearly identify the active privacy mode and training choice.
2. **Make selective forgetting verifiable.** Give users a deletion report covering memories, supporting files and connector-derived copies.
3. **Add governed business workspaces.** Support roles, private/shared context, staff departure, ownership transfer and policy enforcement.
4. **Publish a precise capability matrix.** Separate live connectors/actions from regional, account-specific and future features.
5. **Make completed work measurable.** Show cost, retries, blockers, evidence of delivery and rollback options. For generated media, provide source/model information and explicit output checks.

Best-fit example: analyze Instagram and store performance, identify a campaign opportunity, draft assets in connected design tools, then prepare the campaign for approval. Personal scheduling and shopping can run alongside that work.

**Cost and access change the recommendation**

| Product | Published entry points checked October 8 | What the price does not tell you |
|---|---|---|
| Grok Bot | Included through eligible plans; live product page lists Cursor Pro at $20/month, SuperGrok at $30/month and Cursor Teams Standard at $40/seat/month. | Included usage is limited; additional work and account-level spending controls matter. |
| dots | First dot included with qualifying plans. Pro tiers are $100, $200 and $500/month; Business Premium and eligible admin-enabled deployments have separate access conditions. | Conversation access is not unlimited deeper work. Work/Codex usage still applies to delegated tasks. |
| Muse | Free tier; Power $20/month with 500 million Muse tokens/week; Max $100/month with 3 billion/week. Paid plans remain limited testing and vary by account/region. | Muse tokens are not comparable to another vendor’s quota or to a guaranteed number of completed tasks. |

Sources: [Grok product pricing](https://x.ai/bot), [OpenAI pricing](https://learn.chatgpt.com/docs/pricing), [dots usage/access](https://learn.chatgpt.com/docs/dots), [Muse subscriptions](https://www.meta.com/help/subscriptions/1021145227643680/).

Dots’ individual Pro rollout excludes the EEA, UK and Switzerland; organizational access follows separate conditions. Muse’s newest business announcement says US and Canada. These limits make “best product” partly a question of which version an account can actually access. [dots access](https://learn.chatgpt.com/docs/dots), [Muse availability](https://about.fb.com/news/2026/09/introducing-muse-small-business/)

**How I would choose**

- **Choose Grok Bot when coordinating several distinct operational responsibilities is the priority.** It has the clearest documented combination of standing specialists, shared team agents and routines.
- **Choose dots when the hardest work is research, analysis and software development already connected to ChatGPT Work and Codex.** Its integration is attractive; granular memory control is the issue I would most want resolved.
- **Choose Muse when personal assistance, social/commerce operations and editable personalization dominate.** It is especially compelling for a solo creator or owner-operator. A larger team needs to establish its administrative controls first.
- **Do not pick a media-production winner from these materials.** Artifact support, model demos and connector access do not measure identity consistency, anatomy, editing precision, export quality or revision success.

If using all three, I would assign clear ownership by workflow: one system coordinates operations, one owns technical investigations, and one owns social/personal work. Share approved outputs and current decisions between them. Allowing all three to maintain competing versions of the same plan is likely to create reconciliation work.

**What all three should improve**

The most valuable next improvement is a trustworthy completion record: what was requested, what changed, what remains blocked, where the result lives and how success was checked. A confident final chat message is a weak substitute.

They should also make memory provenance and correction routine, expose per-task budgets, provide dependable cancellation across delegated work, and publish recovery behavior after timeouts or partial success. These capabilities would matter more to sustained usefulness than another long list of integrations.

I would validate the purchase decision with the same six tasks on each: a sourced research brief; a spreadsheet with checkable totals; a small code fix with an existing test; a scheduled monitor with a clear trigger; a corrected-and-forgotten memory; and an interrupted task that must stop cleanly. Measure accepted results, human interventions, elapsed time, cost and evidence of completion. That would turn this documented feature comparison into a defensible performance ranking.
