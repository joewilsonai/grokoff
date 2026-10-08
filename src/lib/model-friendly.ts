// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
import type { EffortLevel } from "../../shared/wire";

/** Preserve provider terminology in every picker mode. */
export function providerEffortLabel(level: EffortLevel): string {
  return level === "xhigh" ? "Extra high" : level[0].toUpperCase() + level.slice(1);
}
