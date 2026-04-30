import {
  getLuckEnabled,
  getLuckPreserveChance,
  getDefaultShopState,
  getRestraintBonusMultiplier,
  getRestraintMinRealtimeSeconds,
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier
} from "./shop.js";
import type { ShopState } from "./shop.js";
import { getIdleHoarderMultiplier, IDLE_HOARDER_SHOP_UPGRADE } from "./shopUpgrades.js";
import { safeNaturalNumber, safeNumber } from "./safeNumber.js";

type IdleRateStep = {
  seconds: number;
  rate: number;
};

const IDLE_RATE_STEPS: IdleRateStep[] = [
  { seconds: 0, rate: 1 },
  { seconds: 60, rate: 1.5 },
  { seconds: 10 * 60, rate: 2 },
  { seconds: 60 * 60, rate: 3 },
  { seconds: 3 * 60 * 60, rate: 4 },
  { seconds: 6 * 60 * 60, rate: 5 },
  { seconds: 24 * 60 * 60, rate: 10 },
  { seconds: 7 * 24 * 60 * 60, rate: 12 },
  { seconds: 4 * 7 * 24 * 60 * 60, rate: 15 },
  { seconds: 365 * 24 * 60 * 60, rate: 20 }
];
export type IdleCollectionPlayer = {
  secondsSinceLastCollection: number;
  shop: ShopState;
  achievementCount: number;
  realTimeAvailable?: number;
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
  const unlockedSteps = Math.max(1, Math.min(IDLE_RATE_STEPS.length, patienceLevel + 1));
  return IDLE_RATE_STEPS.slice(0, unlockedSteps);
}

export function getIdleSecondsRate(player: IdleCollectionPlayer): number {
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

export function calculateIdleSecondsGain(secondsSinceLastCollection: number, shop: ShopState = getDefaultShopState()): number {
  const elapsedSeconds = safeNaturalNumber(secondsSinceLastCollection);
  const accessibleSteps = getAccessibleIdleRateSteps(shop);
  if (elapsedSeconds <= 0) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < accessibleSteps.length; i += 1) {
    const start = accessibleSteps[i - 1];
    const end = accessibleSteps[i];
    if (elapsedSeconds <= start.seconds) {
      break;
    }

    const segmentEnd = Math.min(elapsedSeconds, end.seconds);
    const delta = segmentEnd - start.seconds;
    if (delta <= 0) {
      continue;
    }

    const slope = (end.rate - start.rate) / (end.seconds - start.seconds);
    total += start.rate * delta + 0.5 * slope * delta * delta;
  }

  const lastStep = accessibleSteps[accessibleSteps.length - 1];
  if (elapsedSeconds > lastStep.seconds) {
    total += (elapsedSeconds - lastStep.seconds) * lastStep.rate;
  }

  return Math.floor(total);
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
  const baseGain = calculateIdleSecondsGain(elapsedSeconds, player.shop);
  const secondsMultiplier = getSecondsMultiplier(player.shop);
  const worthwhileAchievementsMultiplier = getWorthwhileAchievementsMultiplier(
    player.shop,
    safeNumber(player.achievementCount, 0)
  );
  const shopBonusMultiplier = getRestraintBonusMultiplier(player.shop);
  const boostedGainBeforeIdleHoarder =
    baseGain * secondsMultiplier * shopBonusMultiplier * worthwhileAchievementsMultiplier;
  const idleHoarderMultiplier = getIdleHoarderMultiplier(
    IDLE_HOARDER_SHOP_UPGRADE.currentLevel(player.shop),
    safeNumber(player.realTimeAvailable, 0),
    elapsedSeconds
  );
  return Math.floor(boostedGainBeforeIdleHoarder * idleHoarderMultiplier);
}

export function getEffectiveIdleSecondsRate(player: IdleCollectionPlayer): number {
  const worthwhileAchievementsMultiplier = getWorthwhileAchievementsMultiplier(
    player.shop,
    safeNumber(player.achievementCount, 0)
  );
  const rateBeforeIdleHoarder =
    getIdleSecondsRate(player) *
    getSecondsMultiplier(player.shop) *
    getRestraintBonusMultiplier(player.shop) *
    worthwhileAchievementsMultiplier;
  const idleHoarderMultiplier = getIdleHoarderMultiplier(
    IDLE_HOARDER_SHOP_UPGRADE.currentLevel(player.shop),
    safeNumber(player.realTimeAvailable, 0),
    safeNaturalNumber(player.secondsSinceLastCollection)
  );
  return (
    rateBeforeIdleHoarder * idleHoarderMultiplier
  );
}

export function shouldPreserveIdleTimerOnCollect(shop: ShopState, randomValue = Math.random()): boolean {
  if (!getLuckEnabled(shop)) {
    return false;
  }
  return randomValue <= getLuckPreserveChance(shop);
}
