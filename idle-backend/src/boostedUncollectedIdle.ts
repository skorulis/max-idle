import type { ResearchState } from "@maxidle/shared/research";
import { DEFAULT_RESEARCH_STATE } from "@maxidle/shared/research";
import type { ShopState } from "@maxidle/shared/shop";
import { calculateBoostedIdleSecondsGain } from "./idleRate.js";
import { calculateElapsedSeconds } from "./time.js";

/** Uncollected idle seconds at refTime (matches client: integral since last_collected_at, then multipliers). */
export function boostedUncollectedIdleSeconds(
  lastCollectedAt: Date,
  refTime: Date,
  shop: ShopState,
  achievementCount: number,
  realTimeAvailable = 0,
  playerLevel = 0,
  blackholeTimeSeconds = 0,
  research: ResearchState = DEFAULT_RESEARCH_STATE
): number {
  const elapsedSinceLastCollection = calculateElapsedSeconds(lastCollectedAt, refTime);
  return calculateBoostedIdleSecondsGain({
    secondsSinceLastCollection: elapsedSinceLastCollection,
    shop,
    achievementCount,
    playerLevel,
    realTimeAvailable,
    wallClockMs: refTime.getTime(),
    blackholeTimeSeconds,
    research
  });
}
