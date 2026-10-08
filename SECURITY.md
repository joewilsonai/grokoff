# Security Policy

<!-- GrokOff modification (2026-10-08): independent source-alpha reporting and local execution boundaries. -->

## Report privately

Use [GitHub's private vulnerability reporting](https://github.com/joewilsonai/grokoff/security/advisories/new) for GrokOff vulnerabilities. Joe Wilson maintains this fork; OpenMausBot's maintainers are not responsible for it. Do not post credentials, sensitive transcripts, or exploit details in a public issue.

Include the affected commit, operating system, a minimal reproduction using disposable data, the impact, and a proposed mitigation if you have one. If the private reporting form is unavailable, request a private contact method through [the maintainer's profile](https://github.com/joewilsonai) without disclosing vulnerability details publicly.

## Supported scope

GrokOff is a source alpha. Security work targets the current repository version; no public binary release or support timetable is promised. The inherited provider, browser, and desktop integrations still need ongoing review. See [fork security notes](docs/design/fork-security.md) for known boundaries and [verification](research/verification.md) for the checks actually performed.

- The harness binds to loopback. Packaged public writes require the desktop's private per-launch capability or an authenticated paired session; built-in integrations use narrower per-turn capabilities. Report capability reuse across bots or turns, unauthorized approvals, and unauthorized dispatch. Anonymous loopback reads remain a documented limitation.
- Saved API keys live in `~/.grokoff/config.json`; the API reports configuration status instead of secret values. A stored secret escaping through responses, events, logs, or process arguments is a vulnerability.
- Agents run real provider CLIs with the user's privileges. Approval controls are a consent layer, not a general operating-system sandbox. **Full access** is a standing decision about provider permission requests; it must not silently authorize credential, routine, skill, or peer-communication confirmations.
- Host desktop control starts disabled on each launch. User opt-in and operating-system permissions remain required. Separate bot folders and browser profiles do not confine every process.
- User-influenced command arguments must not be turned into shell command strings. Report command injection or authorization checks that can be bypassed before a tool runs.

The first local edition does not supply a hosted Slack worker, public relay, or cloud backend. Its two inherited sessionless service dispatch routes are disabled. Do not expose the local server as a public service or treat inherited self-hosting documentation as a security qualification for this fork.

Provider subscriptions, API services, CLIs, and optional runtime components have separate terms and security policies. Findings in those upstream components may need coordination with their maintainers; a GrokOff reproduction should first establish whether this fork causes or exposes the issue.
