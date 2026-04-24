import { getCollectGemBoostLevel } from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import { getCollectGemIdleSecondsMultiplier } from "@maxidle/shared/shopUpgrades";
import { calculateBoostedIdleSecondsGain } from "./idleRate.js";
import { calculateElapsedSeconds } from "./time.js";

/** Uncollected idle seconds at refTime (matches client: integral since last_collected_at, then multipliers). */
export function boostedUncollectedIdleSeconds(
  lastCollectedAt: Date,
  refTime: Date,
  shop: ShopState,
  achievementBonusMultiplier: number
): number {
  const elapsedSinceLastCollection = calculateElapsedSeconds(lastCollectedAt, refTime);
  const base = calculateBoostedIdleSecondsGain({
    secondsSinceLastCollection: elapsedSinceLastCollection,
    shop,
    achievementBonusMultiplier
  });
  return Math.floor(base * getCollectGemIdleSecondsMultiplier(getCollectGemBoostLevel(shop)));
}
