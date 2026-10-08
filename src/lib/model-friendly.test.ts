// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
import { describe, expect, it } from "vitest";
import { EFFORT_LEVELS } from "../../shared/wire";
import { providerEffortLabel } from "./model-friendly";

describe("provider effort terminology", () => {
  it("uses the provider names consistently, including Extra high and Ultra", () => {
    expect(EFFORT_LEVELS.map(providerEffortLabel)).toEqual(["None", "Low", "Medium", "High", "Extra high", "Max", "Ultra"]);
  });
});
