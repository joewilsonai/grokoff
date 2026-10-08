import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { claudeInstanceOwnsRouting } from "../config.ts";
import type { ProviderSnapshot } from "../contracts.ts";

export const CLAUDE_SUBSCRIPTION_ROUTING_REASON = "Claude subscription access is blocked because this account's settings select API or third-party billing. Use Claude (API key), or explicitly configure a custom Claude instance; your Claude credentials and settings have not been changed.";
export const CLAUDE_SUBSCRIPTION_AUTH_REASON = "Claude Code reports API or Console authentication for this account. Sign in with your Claude subscription, or select Claude (API key) / an explicit custom instance.";
export const CLAUDE_SUBSCRIPTION_UNVERIFIED_REASON = "Claude subscription billing could not be verified. Update Claude Code, sign in with your Claude plan, then check the account again. API and third-party billing require Claude (API key) or an explicit custom instance.";

/** Status metadata alone decides billing. Missing or unfamiliar fields never
 * turn an arbitrary working login into a subscription claim. */
export function claudeStatusBilling(status: Record<string, unknown>): ProviderSnapshot["billing"] {
  const method = status.authMethod;
  if (method === "api_key" || method === "console" || method === "anthropic_console" ||
      (typeof status.apiProvider === "string" && status.apiProvider !== "firstParty")) return "metered";
  if (status.apiProvider === "firstParty" && (method === "claude.ai" || method === "oauth_token") &&
      typeof status.subscriptionType === "string" && ["pro", "max", "team", "enterprise"].includes(status.subscriptionType.toLowerCase())) return "subscription";
  return undefined;
}

/** Only inspect settings the CLI would inherit, never its credential store.
 * Checking ancestors also catches a project's settings above the bot's cwd. */
export function claudeSubscriptionSettingsConflict(configDir: string, cwd?: string): string | undefined {
  const paths = new Set([join(configDir, "settings.json")]);
  if (cwd) {
    let directory = resolve(cwd);
    while (true) {
      paths.add(join(directory, ".claude", "settings.json"));
      paths.add(join(directory, ".claude", "settings.local.json"));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  for (const path of paths) {
    try {
      const settings = JSON.parse(readFileSync(path, "utf8"));
      if (typeof settings?.apiKeyHelper === "string" && settings.apiKeyHelper.trim()) return CLAUDE_SUBSCRIPTION_ROUTING_REASON;
      if (settings?.env && typeof settings.env === "object" && claudeInstanceOwnsRouting(settings.env)) return CLAUDE_SUBSCRIPTION_ROUTING_REASON;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return "Claude subscription settings could not be checked safely. Repair the selected Claude settings, then check the account again.";
    }
  }
  return undefined;
}
