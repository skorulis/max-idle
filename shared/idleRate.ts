import {
  getLuckEnabled,
  getLuckPreserveChance,
  getMaxIdleCollectionRealtimeSeconds,
  getRestraintBonusMultiplier,
  getRestraintMinRealtimeSeconds,
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier
} from "./shop.js";
import type { ShopState } from "./shop.js";
import {
  getAntiConsumeristMultiplier,
  getCollectGemIdleSecondsMultiplier,
  getConsolidationBonus,
  getIdleHoarderMultiplier,
  IDLE_HOARDER_SHOP_UPGRADE,
  PATIENCE_SHOP_UPGRADE
} from "./shopUpgrades.js";
import { safeNaturalNumber, safeNumber } from "./safeNumber.js";

type IdleRateStep = {
  seconds: number;
  rate: number;
};

const BASE_IDLE_RATE_STEP: IdleRateStep = { seconds: 0, rate: 0 };
export type IdleCollectionPlayer = {
  secondsSinceLastCollection: number;
  shop: ShopState;
  achievementCount: number;
  realTimeAvailable?: number;
  /** Milliseconds since Unix epoch; required for Anti-consumerist (otherwise that multiplier is treated as ×1). */
  wallClockMs?: number;
};

function interpolateRate(start: IdleRateStep, end: IdleRateStep, elapsedSeconds: number): number {
  const range = end.seconds - start.seconds;
  if (range <= 0) {
    return end.rate;
  }
  const progress = (elapsedSeconds - start.seconds) / range;
  return start.rate + (end.rate - start.rate) * progress;
}

function getAccessibleIdleRateSteps(shop: ShopState): IdleRateStep[] {
  const patienceLevel = safeNaturalNumber(shop.patience);
  const unlockedLevels = Math.max(0, Math.min(PATIENCE_SHOP_UPGRADE.maxLevel(), patienceLevel));
  const unlockedPatienceSteps = PATIENCE_SHOP_UPGRADE.levels
    .slice(0, unlockedLevels)
    .map((level) => ({
      seconds: safeNaturalNumber(level.value2, 0),
      rate: safeNumber(level.value, 0)
    }))
    .filter((step) => step.seconds > 0 && step.rate > 0)
    .sort((a, b) => a.seconds - b.seconds);
  return [BASE_IDLE_RATE_STEP, ...unlockedPatienceSteps];
}

export function getPatienceRate(player: IdleCollectionPlayer): number {
  const elapsedSeconds = safeNaturalNumber(player.secondsSinceLastCollection);
  const accessibleSteps = getAccessibleIdleRateSteps(player.shop);
  if (elapsedSeconds <= 0) {
    return accessibleSteps[0].rate;
  }

  for (let i = 1; i < accessibleSteps.length; i += 1) {
    const end = accessibleSteps[i];
    if (elapsedSeconds <= end.seconds) {
      return interpolateRate(accessibleSteps[i - 1], end, elapsedSeconds);
    }
  }

  return accessibleSteps[accessibleSteps.length - 1].rate;
}

export function isIdleCollectionBlockedByRestraint(player: {
  secondsSinceLastCollection: number;
  shop: ShopState;
}): boolean {
  const elapsedSeconds = safeNaturalNumber(player.secondsSinceLastCollection);
  const minSeconds = getRestraintMinRealtimeSeconds(player.shop);
  return minSeconds > 0 && elapsedSeconds < minSeconds;
}

export function calculateBoostedIdleSecondsGain(player: IdleCollectionPlayer): number {
  const elapsedSeconds = safeNaturalNumber(player.secondsSinceLastCollection);
  const multiplier = getEffectiveIdleSecondsRate(player)
  const total = Math.floor(elapsedSeconds * multiplier);
  return Math.min(total, getMaxIdleCollectionRealtimeSeconds(player.shop));
}

/** Combines secondary bonuses additively: 1 + Σ bᵢ (each `bᵢ` is excess over ×1; base seconds multipliers pass `sum − 1` first). */
function combineIdleSecondaryMultipliers(...bonuses: number[]): number {
  let bonusSum = 0;
  for (const b of bonuses) {
    bonusSum += Number.isFinite(b) ? b : 0;
  }
  return Math.max(bonusSum, 1)
}

export function getEffectiveIdleSecondsRate(player: IdleCollectionPlayer): number {
  const worthwhileAchievementsMultiplier = getWorthwhileAchievementsMultiplier(
    player.shop,
    safeNumber(player.achievementCount, 0)
  );

  const idleHoarderMultiplier = getIdleHoarderMultiplier(
    IDLE_HOARDER_SHOP_UPGRADE.currentLevel(player.shop),
    safeNumber(player.realTimeAvailable, 0),
    safeNaturalNumber(player.secondsSinceLastCollection)
  );

  const secondaryMultiplier = combineIdleSecondaryMultipliers(
    getSecondsMultiplier(player.shop),
    getRestraintBonusMultiplier(player.shop),
    getCollectGemIdleSecondsMultiplier(player.shop),
    getAntiConsumeristMultiplier(player.shop, player.wallClockMs ?? 0),
    getConsolidationBonus(player.shop),
    worthwhileAchievementsMultiplier,
    idleHoarderMultiplier - 1,
    getPatienceRate(player)
  );

  return secondaryMultiplier;
}

export function shouldPreserveIdleTimerOnCollect(shop: ShopState, randomValue = Math.random()): boolean {
  if (!getLuckEnabled(shop)) {
    return false;
  }
  return randomValue <= getLuckPreserveChance(shop);
}
