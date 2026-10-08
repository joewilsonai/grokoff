// GrokOff modification: verify the local fork never offers upstream hosting.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { HOSTED_SERVICES_AVAILABLE, MOBILE_APPS_AVAILABLE } from "@/lib/edition";
import { organisationSignIn } from "@/lib/onboarding";
import { ProIntroduction, ProIntroductionCard, ProLink, ProSettingsCard } from "./ProIntroduction";
import { UpdatesRow } from "./SettingsModal";
import { CloudAccountSettings } from "./CloudAccountSettings";
import { PhoneAppDialog } from "./PhoneAppDialog";
import { companionAccountBridge } from "./PhoneSetupFlow";

afterEach(() => vi.unstubAllGlobals());

it("does not offer billing, enrollment or mobile downloads even when inherited bridges exist", () => {
  const state = vi.fn();
  const begin = vi.fn();
  const bridge = { state, begin };
  vi.stubGlobal("window", { ogb: { cloudAccount: bridge, organization: bridge, companionAccount: bridge } });
  vi.stubGlobal("ogb", { companionAccount: bridge });
  expect(HOSTED_SERVICES_AVAILABLE).toBe(false);
  expect(MOBILE_APPS_AVAILABLE).toBe(false);
  expect(organisationSignIn(window.ogb, { hosted: false })).toBeUndefined();
  expect(companionAccountBridge()).toBeNull();
  for (const node of [
    createElement(ProIntroduction),
    createElement(ProSettingsCard),
    createElement(ProIntroductionCard, { onDismiss: vi.fn() }),
    createElement(ProLink),
    createElement(PhoneAppDialog, { open: true, onClose: vi.fn() }),
  ]) expect(renderToStaticMarkup(node)).toBe("");
  const cloud = renderToStaticMarkup(createElement(CloudAccountSettings));
  expect(cloud).toContain("Hosted cloud is unavailable in this local edition.");
  expect(cloud).not.toContain("Sign in");
  const updates = renderToStaticMarkup(createElement(UpdatesRow));
  expect(updates).toContain("Automatic updates unavailable for this local build.");
  expect(updates).not.toContain("Check for updates");
  expect(state).not.toHaveBeenCalled();
  expect(begin).not.toHaveBeenCalled();
});
