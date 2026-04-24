import { calculateBoostedIdleSecondsGain } from "./idleRate.js";
import { calculateElapsedSeconds } from "./time.js";
import type { ShopState } from "@maxidle/shared/shop";

/** Uncollected idle seconds at refTime (matches client: integral since last_collected_at, then multipliers). */
export function boostedUncollectedIdleSeconds(
  lastCollectedAt: Date,
  refTime: Date,
  shop: ShopState,
  achievementBonusMultiplier: number
): number {
  const elapsedSinceLastCollection = calculateElapsedSeconds(lastCollectedAt, refTime);
  return calculateBoostedIdleSecondsGain({
    secondsSinceLastCollection: elapsedSinceLastCollection,
    shop,
    achievementBonusMultiplier
  });
}
