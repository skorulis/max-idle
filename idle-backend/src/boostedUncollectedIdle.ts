import type { ShopState } from "@maxidle/shared/shop";
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
  return calculateBoostedIdleSecondsGain({
    secondsSinceLastCollection: elapsedSinceLastCollection,
    shop,
    achievementCount,
    realTimeAvailable,
    wallClockMs: refTime.getTime()
  });
}
