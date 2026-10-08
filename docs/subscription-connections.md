# Claude and Codex subscriptions

GrokOff connects to the official Claude Code and Codex CLIs installed on the
Mac running its local server. Each bot can select its own provider and model.
Subscription connections and API providers are separate choices.

## Connect an existing account

1. Open **Settings → Model providers** and choose **Check again**.
2. If Claude Code or Codex is already installed and signed in with a subscription,
   GrokOff can reuse that CLI-managed account. The card shows **Ready** and either
   **Claude subscription** or **ChatGPT subscription**.
3. If the card needs setup, install the official CLI if necessary, then use its
   sign-in control. Complete the provider's login in your browser. Signing in to
   Claude Desktop alone does not establish a Claude Code login.
4. Open a bot's model picker, choose Claude or OpenAI, then choose the account and
   an available model. Other bots can use a different provider.

To check the official CLI independently, use `claude auth status --json` or
`codex login status`. These status checks do not run an AI task. Do not paste
credential files, tokens or passwords into a bot conversation.

## Billing and account boundaries

The default subscription adapters require a recognized Claude account login or
ChatGPT login. A stored API-key login or an unrecognized authentication mode must
not be presented as a ready subscription connection or used silently for a turn.
Explicit custom/API provider configurations retain their separate billing route.
GrokOff's child-process environment does not change your shell environment or
sign out other apps.

The default Codex and Claude connections share their CLI-managed login with other
local uses of that CLI. Their **Sign out** controls sign out that shared account;
removing a configured account from GrokOff alone is a separate action. The
separate **ChatGPT plan** connection uses its own GrokOff-managed login and does
not automatically reuse the Codex CLI account.

For an intentional third-party Claude endpoint or `apiKeyHelper` in the selected
CLI settings, a manually configured Claude instance can opt in with
`config.authMode: "custom"`. Saved routing variables or an explicit Claude API-key
instance also select custom access. Ambient shell variables do not. Custom
access is shown as usage-based billing; it does not promise subscription access.

The CLI manages its account credentials. GrokOff's local bot data does not grant
a second subscription allowance. Subscription limits are shared with other work
on that account, and provider-enabled extra usage may have a cost. GrokOff does
not sell, pool or extend those allowances.

A subscription badge identifies the signed-in account, not a promise that every
model is included. Anthropic currently says Fable may require usage credits,
depending on the plan and seat. Noninteractive `claude -p` and Agent SDK requests
can bill those credits without the interactive Claude Code consent prompt.
Check the provider's model eligibility and billing settings before choosing a
credit-billed model. The acceptance checks here use Sonnet rather than Fable.
See [Claude Code model billing](https://code.claude.com/docs/en/model-config#fable-and-usage-credits).

Claude's current support guidance allows Agent SDK, `claude -p` and third-party
app usage against subscription limits. Codex's app-server is the documented
interface for integrating its login, approvals and streamed agent events into a
client. These claims were checked on October 8, 2026:

- [Claude plan and Agent SDK usage](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Claude Code authentication](https://code.claude.com/docs/en/authentication)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)

A **Ready** card verifies local installation and recognized sign-in metadata. A
successful real task still needs a live inference and tool-use acceptance check.
On October 8, 2026, isolated checks passed for Claude Sonnet 5.5 and Codex
GPT-6-Astra at Medium effort; [acceptance evidence](../research/subscription-live-acceptance.md)
records their tool reads and completed responses. Other models and general
agent reliability require their own checks.
