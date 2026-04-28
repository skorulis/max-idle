import {
  getLuckEnabled,
  getLuckPreserveChance,
  getRestraintBonusMultiplier,
  getRestraintEnabled,
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier
} from "./shop.js";
import type { ShopState } from "./shop.js";
import { getIdleHoarderMultiplier, IDLE_HOARDER_SHOP_UPGRADE } from "./shopUpgrades.js";

type IdleRateStep = {
  seconds: number;
  rate: number;
};

const IDLE_RATE_STEPS: IdleRateStep[] = [
  { seconds: 0, rate: 1 },
  { seconds: 60, rate: 2 },
  { seconds: 10 * 60, rate: 3 },
  { seconds: 60 * 60, rate: 5 },
  { seconds: 6 * 60 * 60, rate: 8 },
  { seconds: 24 * 60 * 60, rate: 12 },
  { seconds: 7 * 24 * 60 * 60, rate: 15 },
  { seconds: 4 * 7 * 24 * 60 * 60, rate: 20 },
  { seconds: 365 * 24 * 60 * 60, rate: 30 }
];
const RESTRAINT_MIN_REALTIME_SECONDS = 60 * 60;

export type IdleRatePlayer = {
  secondsSinceLastCollection: number;
};

export type IdleCollectionPlayer = {
  secondsSinceLastCollection: number;
  shop: ShopState;
  achievementCount: number;
  realTimeAvailable?: number;
};

function clampElapsedSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function interpolateRate(start: IdleRateStep, end: IdleRateStep, elapsedSeconds: number): number {
  const range = end.seconds - start.seconds;
  if (range <= 0) {
    return end.rate;
  }
  const progress = (elapsedSeconds - start.seconds) / range;
  return start.rate + (end.rate - start.rate) * progress;
}

export function getIdleSecondsRate(player: IdleRatePlayer): number {
  const elapsedSeconds = clampElapsedSeconds(player.secondsSinceLastCollection);
  if (elapsedSeconds <= 0) {
    return IDLE_RATE_STEPS[0].rate;
  }

  for (let i = 1; i < IDLE_RATE_STEPS.length; i += 1) {
    const end = IDLE_RATE_STEPS[i];
    if (elapsedSeconds <= end.seconds) {
      return interpolateRate(IDLE_RATE_STEPS[i - 1], end, elapsedSeconds);
    }
  }

  return IDLE_RATE_STEPS[IDLE_RATE_STEPS.length - 1].rate;
}

export function calculateIdleSecondsGain(secondsSinceLastCollection: number): number {
  const elapsedSeconds = clampElapsedSeconds(secondsSinceLastCollection);
  if (elapsedSeconds <= 0) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < IDLE_RATE_STEPS.length; i += 1) {
    const start = IDLE_RATE_STEPS[i - 1];
    const end = IDLE_RATE_STEPS[i];
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

  const lastStep = IDLE_RATE_STEPS[IDLE_RATE_STEPS.length - 1];
  if (elapsedSeconds > lastStep.seconds) {
    total += (elapsedSeconds - lastStep.seconds) * lastStep.rate;
  }

  return Math.floor(total);
}

export function isIdleCollectionBlockedByRestraint(player: {
  secondsSinceLastCollection: number;
  shop: ShopState;
}): boolean {
  const elapsedSeconds = clampElapsedSeconds(player.secondsSinceLastCollection);
  return getRestraintEnabled(player.shop) && elapsedSeconds < RESTRAINT_MIN_REALTIME_SECONDS;
}

export function calculateBoostedIdleSecondsGain(player: IdleCollectionPlayer): number {
  const elapsedSeconds = clampElapsedSeconds(player.secondsSinceLastCollection);
  const baseGain = calculateIdleSecondsGain(elapsedSeconds);
  const secondsMultiplier = getSecondsMultiplier(player.shop);
  const worthwhileAchievementsMultiplier = getWorthwhileAchievementsMultiplier(
    player.shop,
    Number.isFinite(player.achievementCount) ? player.achievementCount : 0
  );
  const shopBonusMultiplier = getRestraintBonusMultiplier(player.shop);
  const boostedGainBeforeIdleHoarder =
    baseGain * secondsMultiplier * shopBonusMultiplier * worthwhileAchievementsMultiplier;
  const idleHoarderMultiplier = getIdleHoarderMultiplier(
    IDLE_HOARDER_SHOP_UPGRADE.currentLevel(player.shop),
    Number.isFinite(player.realTimeAvailable) ? Number(player.realTimeAvailable) : 0,
    elapsedSeconds
  );
  return Math.floor(boostedGainBeforeIdleHoarder * idleHoarderMultiplier);
}

export function getEffectiveIdleSecondsRate(player: IdleCollectionPlayer): number {
  const worthwhileAchievementsMultiplier = getWorthwhileAchievementsMultiplier(
    player.shop,
    Number.isFinite(player.achievementCount) ? player.achievementCount : 0
  );
  const rateBeforeIdleHoarder =
    getIdleSecondsRate({ secondsSinceLastCollection: player.secondsSinceLastCollection }) *
    getSecondsMultiplier(player.shop) *
    getRestraintBonusMultiplier(player.shop) *
    worthwhileAchievementsMultiplier;
  const idleHoarderMultiplier = getIdleHoarderMultiplier(
    IDLE_HOARDER_SHOP_UPGRADE.currentLevel(player.shop),
    Number.isFinite(player.realTimeAvailable) ? Number(player.realTimeAvailable) : 0,
    clampElapsedSeconds(player.secondsSinceLastCollection)
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
