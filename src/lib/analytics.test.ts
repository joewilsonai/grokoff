// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
import { afterEach, describe, expect, it, vi } from "vitest";
const telemetry = vi.hoisted(() => ({ loads: 0 }));
vi.mock("posthog-js", () => {
  telemetry.loads += 1;
  throw new Error("GrokOff must never import upstream telemetry");
});
afterEach(() => vi.unstubAllGlobals());
describe("GrokOff telemetry boundary", () => {
  it("never loads analytics, even after an attempted opt-in", async () => {
    const analytics = await import("./analytics");
    analytics.setAnalyticsEnabled(true);
    await Promise.all([analytics.initAnalytics(), analytics.initAnalytics()]);
    analytics.track("app_opened", { privateText: "fixture only" });
    analytics.identifyEmail("fixture@example.invalid");
    expect(analytics.analyticsEnabled()).toBe(false);
    expect(analytics.optAction(true, true)).toBe("none");
    expect(telemetry.loads).toBe(0);
  });
  it("requires neither browser storage nor an email gate", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
    });
    const analytics = await import("./analytics");
    expect(analytics.emailGateDone()).toBe(true);
    expect(() => analytics.setEmailGateDone("skipped")).not.toThrow();
    expect(() => analytics.setAnalyticsEnabled(false)).not.toThrow();
    await analytics.initAnalytics();
    expect(telemetry.loads).toBe(0);
  });
});
