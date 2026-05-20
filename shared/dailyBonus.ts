import { getResearchBonusAtLevel, getResearchLevel, type ResearchState } from "./research.js";
import {
  RESEARCH_DAILY_BONUS_ACTIVATION_COST,
  RESEARCH_ITEM_IDS
} from "./researchItems.js";

/** Idle seconds required to activate the daily bonus from daily bonus activation cost research. */
export function getDailyBonusActivationCostIdleSeconds(research: ResearchState): number {
  const level = getResearchLevel(research, RESEARCH_ITEM_IDS.DAILY_BONUS_ACTIVATION_COST);
  return Math.max(1, Math.floor(getResearchBonusAtLevel(RESEARCH_DAILY_BONUS_ACTIVATION_COST, level)));
}

export function isDailyBonusEffectActiveForUtcDay(
  lastDailyBonusClaimedAt: Date | null,
  bonusDateUtc: Date
): boolean {
  return (
    lastDailyBonusClaimedAt !== null && lastDailyBonusClaimedAt.getTime() >= bonusDateUtc.getTime()
  );
}
