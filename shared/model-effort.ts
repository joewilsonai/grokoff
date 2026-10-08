import type { EffortLevel } from "./wire.ts";

/** A model's reported choices take precedence, including an explicit empty list.
 * Older catalogs retain the driver's declared choices until refreshed. */
export function modelEffortLevels(
  model: string,
  models: { options: readonly { id: string; effortLevels?: readonly EffortLevel[] }[] },
  capabilities?: { effortLevels?: readonly EffortLevel[] },
): readonly EffortLevel[] {
  return models.options.find(option => option.id === model)?.effortLevels
    ?? capabilities?.effortLevels ?? [];
}
