import type { ShopState } from "@maxidle/shared/shop";
import { COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE, getCollectGemIdleSecondsMultiplier } from "@maxidle/shared/shopUpgrades";
import { calculateBoostedIdleSecondsGain } from "./idleRate.js";
import { calculateElapsedSeconds } from "./time.js";

/** Uncollected idle seconds at refTime (matches client: integral since last_collected_at, then multipliers). */
export function boostedUncollectedIdleSeconds(
  lastCollectedAt: Date,
  refTime: Date,
  shop: ShopState,
  achievementCount: number,
  realTimeAvailable = 0
): number {
  const elapsedSinceLastCollection = calculateElapsedSeconds(lastCollectedAt, refTime);
  const base = calculateBoostedIdleSecondsGain({
    secondsSinceLastCollection: elapsedSinceLastCollection,
    shop,
    achievementCount,
    realTimeAvailable
  });
  return Math.floor(base * getCollectGemIdleSecondsMultiplier(COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.currentLevel(shop)));
}
