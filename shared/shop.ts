import {
  ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE,
  DAILY_BONUS_FEATURE_SHOP_UPGRADE,
  TOURNAMENT_FEATURE_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  SHOP_UPGRADES_BY_ID,
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  STORAGE_EXTENSION_SHOP_UPGRADE,
  WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE,
  SHOP_UPGRADES,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS,
  getWorthwhileAchievementsBonusPerAchievement
} from "./shopUpgrades.js";
import type { ShopCurrencyType, ShopUpgradeDefinition, ShopUpgradeId } from "./shopUpgrades.js";
import { safeNumber } from "./safeNumber.js";
import { SECONDS_PER_WEEK } from "./timeConstants.js";

const DEFAULT_SECONDS_MULTIPLIER_LEVEL = 0;
const DEFAULT_SECONDS_MULTIPLIER_VALUE = 1;

export type ShopState = {
  seconds_multiplier: number;
  another_seconds_multiplier?: number;
  patience?: number;
  restraint: number;
  idle_hoarder?: number;
  luck: number;
  /** Resets to 0 on collect. Same key as {@link SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST}. */
  collect_gem_time_boost?: number;
  worthwhile_achievements?: number;
  /** {@link SHOP_UPGRADE_IDS.STORAGE_EXTENSION} — raises boosted-idle storage ceiling (see {@link getMaxIdleCollectionRealtimeSeconds}). */
  storage_extension?: number;
  [key: string]: unknown;
};

export const DEFAULT_SHOP_STATE: ShopState = {
  [SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER]: 0,
  [SHOP_UPGRADE_IDS.ANOTHER_SECONDS_MULTIPLIER]: 0,
  [SHOP_UPGRADE_IDS.PATIENCE]: 0,
  [SHOP_UPGRADE_IDS.RESTRAINT]: 0,
  [SHOP_UPGRADE_IDS.IDLE_HOARDER]: 0,
  [SHOP_UPGRADE_IDS.LUCK]: 0,
  [SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS]: 0,
  [SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST]: 0,
  [SHOP_UPGRADE_IDS.STORAGE_EXTENSION]: 0
};

export function getDefaultShopState(): ShopState {
  return { ...DEFAULT_SHOP_STATE };
}

function clampSecondsMultiplierLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return DEFAULT_SECONDS_MULTIPLIER_LEVEL;
  }
  return Math.max(
    DEFAULT_SECONDS_MULTIPLIER_LEVEL,
    Math.min(SECONDS_MULTIPLIER_SHOP_UPGRADE.maxLevel(), Math.floor(level))
  );
}

export function withShopUpgradeLevel(shop: ShopState, upgradeId: ShopUpgradeId, level: number): ShopState {
  const upgrade = SHOP_UPGRADES_BY_ID[upgradeId];
  const safeLevel = Number.isFinite(level)
    ? Math.max(0, Math.min(upgrade.maxLevel(), Math.floor(level)))
    : 0;
  return {
    ...shop,
    [upgradeId]: safeLevel
  };
}

export function getSecondsMultiplierUpgradeValue(level: number): number {
  const safeLevel = clampSecondsMultiplierLevel(level);
  if (safeLevel <= DEFAULT_SECONDS_MULTIPLIER_LEVEL) {
    return DEFAULT_SECONDS_MULTIPLIER_VALUE;
  }
  const definition = SECONDS_MULTIPLIER_SHOP_UPGRADE.levels[safeLevel - 1];
  return definition?.value ?? DEFAULT_SECONDS_MULTIPLIER_VALUE;
}

export function getSecondsMultiplier(shop: ShopState): number {
  const baseMultiplier = getSecondsMultiplierUpgradeValue(SECONDS_MULTIPLIER_SHOP_UPGRADE.currentLevel(shop));
  const anotherBaseMultiplier = getSecondsMultiplierUpgradeValue(
    ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE.currentLevel(shop)
  );
  return baseMultiplier * anotherBaseMultiplier;
}

export function getRestraintEnabled(shop: ShopState): boolean {
  return RESTRAINT_SHOP_UPGRADE.currentLevel(shop) > 0;
}

export function getRestraintBonusMultiplier(shop: ShopState): number {
  const restraintLevel = RESTRAINT_SHOP_UPGRADE.currentLevel(shop);
  if (restraintLevel <= 0) {
    return 1;
  }
  return RESTRAINT_SHOP_UPGRADE.levels[restraintLevel - 1]?.value ?? 1;
}

/** Realtime seconds required before collect when restraint is active; from current tier's `value2` (hours). */
export function getRestraintMinRealtimeSeconds(shop: ShopState): number {
  const restraintLevel = RESTRAINT_SHOP_UPGRADE.currentLevel(shop);
  if (restraintLevel <= 0) {
    return 0;
  }
  const hours = safeNumber(RESTRAINT_SHOP_UPGRADE.levels[restraintLevel - 1]?.value2, 1);
  return Math.max(1, hours) * 60 * 60;
}

/** User-facing message when collect is blocked by restraint (tier-specific wait). */
export function formatRestraintBlockedCollectMessage(shop: ShopState): string {
  const sec = getRestraintMinRealtimeSeconds(shop);
  if (sec <= 0) {
    return "Restraint blocks collection until the required realtime has passed.";
  }
  const hours = sec / (60 * 60);
  const label =
    hours === 1 ? "1 hour" : `${Number.isInteger(hours) ? String(hours) : hours.toFixed(1)} hours`;
  return `Restraint blocks collection until at least ${label} of realtime has passed.`;
}

/** ×(1 + bonusPerAchievement × achievementCount), from Worthwhile Achievements tier and unlock count. */
export function getWorthwhileAchievementsMultiplier(shop: ShopState, achievementCount: number): number {
  const bonusPer = getWorthwhileAchievementsBonusPerAchievement(WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE.currentLevel(shop));
  const count = Math.max(0, Math.floor(safeNumber(achievementCount, 0)));
  return 1 + bonusPer * count;
}

export function getLuckEnabled(shop: ShopState): boolean {
  return LUCK_SHOP_UPGRADE.currentLevel(shop) > 0;
}

export function isDailyBonusFeatureUnlocked(shop: ShopState): boolean {
  return DAILY_BONUS_FEATURE_SHOP_UPGRADE.currentLevel(shop) > 0;
}

export function isTournamentFeatureUnlocked(shop: ShopState): boolean {
  return TOURNAMENT_FEATURE_SHOP_UPGRADE.currentLevel(shop) > 0;
}

export function getLuckPreserveChance(shop: ShopState): number {
  const luckLevel = LUCK_SHOP_UPGRADE.currentLevel(shop);
  if (luckLevel <= 0) {
    return 0;
  }
  return LUCK_SHOP_UPGRADE.levels[luckLevel - 1]?.value ?? 0;
}

/**
 * Reference wall-clock window for the storage ceiling: boosted idle never exceeds what this many real seconds would produce
 * (same multipliers), with tier-specific caps from the shop definition.
 */
export function getMaxIdleCollectionRealtimeSeconds(shop: ShopState): number {
  const level = STORAGE_EXTENSION_SHOP_UPGRADE.currentLevel(shop);
  if (level <= 0) {
    return 2 * SECONDS_PER_WEEK;
  }
  return STORAGE_EXTENSION_SHOP_UPGRADE.levels[level - 1]?.value ?? 0;
}

export function multiplierToLevel(secondsMultiplier: number): number {
  if (!Number.isFinite(secondsMultiplier) || secondsMultiplier <= 1) {
    return 0;
  }
  for (let i = SECONDS_MULTIPLIER_SHOP_UPGRADE.levels.length - 1; i >= 0; i -= 1) {
    if (secondsMultiplier >= SECONDS_MULTIPLIER_SHOP_UPGRADE.levels[i].value) {
      return i + 1;
    }
  }
  return 0;
}

export function levelToMultiplier(level: number): number {
  return getSecondsMultiplierUpgradeValue(level);
}

function getTotalUpgradeCostPurchased(upgrade: ShopUpgradeDefinition, shop: ShopState): number {
  const safeLevel = upgrade.currentLevel(shop);
  let total = 0;
  for (let i = 0; i < safeLevel; i += 1) {
    total += upgrade.costAtLevel(i);
  }
  return total;
}

export function getShopPurchaseRefundTotals(shop: ShopState): { idle: number; real: number } {
  const totals = { idle: 0, real: 0 };
  for (const upgrade of SHOP_UPGRADES) {
    if (upgrade.currencyType === SHOP_CURRENCY_TYPES.GEM) {
      continue;
    }
    const refund = getTotalUpgradeCostPurchased(upgrade, shop);
    if (upgrade.currencyType === SHOP_CURRENCY_TYPES.IDLE) {
      totals.idle += refund;
    } else {
      totals.real += refund;
    }
  }
  return totals;
}

export function hasRefundableShopPurchases(shop: ShopState): boolean {
  const refundTotals = getShopPurchaseRefundTotals(shop);
  return (
    refundTotals[SHOP_CURRENCY_TYPES.IDLE] > 0 ||
    refundTotals[SHOP_CURRENCY_TYPES.REAL] > 0
  );
}

/** True when the player can buy at least one upgrade priced in idle or real time (not gems). */
/**
 * Sum of purchased tiers for every shop upgrade priced in `currencyType` (from {@link SHOP_UPGRADES}).
 * Each stored level counts as one; matches how refund totals are derived from the same shop JSON.
 * Gem-only purchases that do not persist in shop (e.g. time skip) are not included.
 */
export function getPurchasedShopUpgradeLevelCount(shop: ShopState, currencyType: ShopCurrencyType): number {
  let total = 0;
  for (const upgrade of SHOP_UPGRADES) {
    if (upgrade.currencyType !== currencyType) {
      continue;
    }
    total += upgrade.currentLevel(shop);
  }
  return total;
}

export function hasAffordableIdleOrRealTimeShopPurchase(
  shop: ShopState,
  idleAvailable: number,
  realAvailable: number
): boolean {
  const idle = safeNumber(idleAvailable, 0);
  const real = safeNumber(realAvailable, 0);
  for (const upgrade of SHOP_UPGRADES) {
    if (upgrade.currencyType === SHOP_CURRENCY_TYPES.GEM) {
      continue;
    }
    const currentLevel = upgrade.currentLevel(shop);
    if (currentLevel >= upgrade.maxLevel()) {
      continue;
    }
    const cost = upgrade.costAtLevel(currentLevel);
    if (!(cost > 0)) {
      continue;
    }
    const balance = upgrade.currencyType === SHOP_CURRENCY_TYPES.IDLE ? idle : real;
    if (balance >= cost) {
      return true;
    }
  }
  return false;
}
