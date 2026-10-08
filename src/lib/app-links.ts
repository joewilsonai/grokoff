// GrokOff modification (2026-10-08): local-edition identity, UI availability, or matching verification.
// The handful of outward links the app offers from the profile menu and the
// About dialog. They are collected here so "where does Help go?" has one
// answer rather than one per call site.
export const APP_NAME = "GrokOff";
export const APP_REPOSITORY = "https://github.com/milind-soni/OpenMausBot";
/** The docs tree is the help centre, and it is where openmausbot.com sends
 * people too — one destination, not two competing ones. */
export const UPSTREAM_COMMIT = "3e9e42b3a05e0b7c4edbaedba2e667b851296e27";
export const DOCS_URL = `${APP_REPOSITORY}/tree/${UPSTREAM_COMMIT}/docs`;
export const HELP_CENTER_URL = DOCS_URL;
export const APPROVAL_LEVELS_URL = `${APP_REPOSITORY}/blob/${UPSTREAM_COMMIT}/docs/approval-levels.md`;
export const PRO_URL = "https://www.openmausbot.com/pro";
/** Every OMB Cloud plan side by side (Personal, Pro, Max). */
export const PRICING_URL = "https://www.openmausbot.com/pricing";
export const LICENSE_URL = `${APP_REPOSITORY}/blob/${UPSTREAM_COMMIT}/LICENSE`;
/** The phone apps, the same two links openmausbot.com (lib/config.ts) and the
 * Cloud page offer. iOS is on the App Store, listed as "MausBot". Android is
 * an APK attached to a GitHub release: the link names a version, so a new
 * Android release updates it here too. */
export const IOS_APP_STORE_URL = "https://apps.apple.com/in/app/mausbot/id6803387923";
export const ANDROID_APK_URL = `${APP_REPOSITORY}/releases/download/android-v1.5.0/OpenMausBot.apk`;

/** The version Vite inlined from package.json; "dev" when the define is
 * missing (a bare `tsc`/test run outside the bundler). */
export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

/** "macOS", "Windows", "Linux" — or nothing at all in the browser, where the
 * host OS is not ours to claim. */
export function platformLabel(platform?: string): string | null {
  return (platform && PLATFORM_NAMES[platform]) ?? null;
}

/** Hands a link to the default browser through the preload bridge, falling
 * back to a new tab when the app runs in a plain browser. */
export async function openExternalLink(url: string): Promise<void> {
  if (window.ogb?.openExternal) {
    await window.ogb.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
