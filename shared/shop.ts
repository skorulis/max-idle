import {
  ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE,
  ANTI_CONSUMERIST_SHOP_UPGRADE,
  COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  CONSOLIDATION_SHOP_UPGRADE,
  IDLE_HOARDER_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  QUICK_COLLECTOR_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  SHOP_UPGRADES_BY_ID,
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  STORAGE_EXTENSION_SHOP_UPGRADE,
  WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE,
  LEVEL_BONUS_SHOP_UPGRADE,
  SHOP_UPGRADES,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_DESCRIPTION_VALUE_PLACEHOLDER,
  SHOP_UPGRADE_IDS,
} from "./shopUpgrades.js";
import {
  getShopCurrencyTierPurchaseCostSum,
  getTotalShopCurrencySpentForPurchaseCount,
} from "./shopCurrencyCostTable.js";
import type { ShopCurrencyType, ShopUpgradeDefinition, ShopUpgradeId } from "./shopUpgrades.js";
import { safeNaturalNumber, safeNumber } from "./safeNumber.js";
import { SECONDS_PER_WEEK } from "./timeConstants.js";

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
  /** {@link SHOP_UPGRADE_IDS.LEVEL_BONUS} — bonus per player level (see {@link getLevelBonusIdleContribution}). */
  level_bonus?: number;
  /** {@link SHOP_UPGRADE_IDS.STORAGE_EXTENSION} — raises boosted-idle storage ceiling (see {@link getMaxIdleCollectionRealtimeSeconds}). */
  storage_extension?: number;
  /** {@link SHOP_UPGRADE_IDS.ANTI_CONSUMERIST} — streak multiplier tiers (see {@link getAntiConsumeristMultiplier}). */
  anti_consumerist?: number;
  /** {@link SHOP_UPGRADE_IDS.CONSOLIDATION} — bonus when few other idle shop lines are used (see {@link getConsolidationBonus}). */
  consolidation?: number;
  /** {@link SHOP_UPGRADE_IDS.QUICK_COLLECTOR} — early-run idle bonus (see {@link getQuickCollectorBonus}). */
  quick_collector?: number;
  /**
   * UTC Unix timestamp in seconds for the last shop purchase paid with idle or real time.
   * Set by the server on those purchases only; gem-priced buys do not update this field.
   */
  last_purchase?: number;
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
  [SHOP_UPGRADE_IDS.LEVEL_BONUS]: 0,
  [SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST]: 0,
  [SHOP_UPGRADE_IDS.STORAGE_EXTENSION]: 0,
  [SHOP_UPGRADE_IDS.ANTI_CONSUMERIST]: 0,
  [SHOP_UPGRADE_IDS.CONSOLIDATION]: 0,
  [SHOP_UPGRADE_IDS.QUICK_COLLECTOR]: 0
};

export function getDefaultShopState(): ShopState {
  return { ...DEFAULT_SHOP_STATE };
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

export function getSecondsMultiplier(shop: ShopState): number {
  return SECONDS_MULTIPLIER_SHOP_UPGRADE.currentValue(shop) +
    ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE.currentValue(shop);
}

export function getRestraintEnabled(shop: ShopState): boolean {
  return RESTRAINT_SHOP_UPGRADE.currentLevel(shop) > 0;
}

/** Additive bonus over ×1 from Restraint tier `value` (excess over ×1), not the full multiplier. */
export function getRestraintBonusMultiplier(shop: ShopState): number {
  return RESTRAINT_SHOP_UPGRADE.currentValue(shop);
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
  const bonusPer = WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE.currentValue(shop);
  const count = Math.max(0, Math.floor(safeNumber(achievementCount, 0)));
  return bonusPer * count;
}

/** Additive idle rate bonus: `bonusPerPlayerLevel × playerLevel` when Level bonus has any tier unlocked. */
export function getLevelBonusIdleContribution(shop: ShopState, playerLevel: number): number {
  const tier = LEVEL_BONUS_SHOP_UPGRADE.currentLevel(shop);
  if (tier <= 0) {
    return 0;
  }
  const bonusPer = LEVEL_BONUS_SHOP_UPGRADE.currentValue(shop);
  const lv = Math.max(0, Math.floor(safeNumber(playerLevel, 1)));
  return bonusPer * lv;
}

export function getLuckEnabled(shop: ShopState): boolean {
  return LUCK_SHOP_UPGRADE.currentLevel(shop) > 0;
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

export function getShopPurchaseRefundTotals(shop: ShopState): { idle: number; real: number } {
  const idleCount = getPurchasedShopUpgradeLevelCount(shop, SHOP_CURRENCY_TYPES.IDLE);
  const realCount = getPurchasedShopUpgradeLevelCount(shop, SHOP_CURRENCY_TYPES.REAL);
  return {
    idle: getTotalShopCurrencySpentForPurchaseCount(SHOP_CURRENCY_TYPES.IDLE, idleCount),
    real: getTotalShopCurrencySpentForPurchaseCount(SHOP_CURRENCY_TYPES.REAL, realCount)
  };
}

export function hasRefundableIdleShopPurchases(shop: ShopState): boolean {
  return getShopPurchaseRefundTotals(shop).idle > 0;
}

export function hasRefundableRealShopPurchases(shop: ShopState): boolean {
  return getShopPurchaseRefundTotals(shop).real > 0;
}

export function hasRefundableShopPurchases(shop: ShopState): boolean {
  return hasRefundableIdleShopPurchases(shop) || hasRefundableRealShopPurchases(shop);
}

/** Reset tiers for upgrades priced in idle time; leaves real-priced and gem-priced shop keys unchanged. */
export function withIdleCurrencyShopUpgradesReset(shop: ShopState): ShopState {
  const next: ShopState = { ...shop };
  const defaults = DEFAULT_SHOP_STATE as Record<string, number | undefined>;
  for (const upgrade of SHOP_UPGRADES) {
    if (upgrade.currencyType === SHOP_CURRENCY_TYPES.IDLE) {
      next[upgrade.id] = defaults[upgrade.id] ?? 0;
    }
  }
  return next;
}

/** Reset tiers for upgrades priced in real time; leaves idle-priced and gem-priced shop keys unchanged. */
export function withRealCurrencyShopUpgradesReset(shop: ShopState): ShopState {
  const next: ShopState = { ...shop };
  const defaults = DEFAULT_SHOP_STATE as Record<string, number | undefined>;
  for (const upgrade of SHOP_UPGRADES) {
    if (upgrade.currencyType === SHOP_CURRENCY_TYPES.REAL) {
      next[upgrade.id] = defaults[upgrade.id] ?? 0;
    }
  }
  return next;
}

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

/** True when the player can buy at least one upgrade priced in idle or real time (not gems). */
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
    const cost = getShopCurrencyTierPurchaseCostSum(
      upgrade.currencyType,
      getPurchasedShopUpgradeLevelCount(shop, upgrade.currencyType),
      1
    );
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

export function getIdleHoarderMaxLevel(): number {
  return IDLE_HOARDER_SHOP_UPGRADE.maxLevel();
}

export function getIdleHoarderMaxMultiplierForLevel(level: number): number {
  const maxLevel = getIdleHoarderMaxLevel();
  const L = Math.max(0, Math.min(maxLevel, level));
  if (L <= 0) {
    return 1;
  }
  const bonus = IDLE_HOARDER_SHOP_UPGRADE.levels[L - 1]?.value ?? 0;
  return 1 + safeNumber(bonus, 0);
}

function getIdleHoarderRatioThresholdForLevel(level: number): number {
  const maxLevel = getIdleHoarderMaxLevel();
  const L = Math.max(0, Math.min(maxLevel, Math.floor(Number(level) || 0)));
  if (L <= 0) {
    return Infinity;
  }
  const raw = IDLE_HOARDER_SHOP_UPGRADE.levels[L - 1]?.value2;
  return safeNaturalNumber(raw, 1);
}

/**
 * Stored-real-time bonus from idle hoarder:
 * - Below tier threshold: ×1
 * - When `realTimeAvailable / secondsSinceLastCollection >=` that level's `value2`: full tier `value` multiplier
 */
export function getIdleHoarderMultiplier(level: number, realTimeAvailable: number, secondsSinceLastCollection: number): number {
  const maxMultiplier = getIdleHoarderMaxMultiplierForLevel(level);
  if (maxMultiplier <= 1) {
    return 1;
  }
  const safeAvailable = safeNaturalNumber(realTimeAvailable, 0);
  const safeRealtime = safeNaturalNumber(secondsSinceLastCollection, 0);
  if (safeRealtime <= 0) {
    return safeAvailable > 0 ? maxMultiplier : 1;
  }
  const ratio = safeAvailable / safeRealtime;
  const threshold = getIdleHoarderRatioThresholdForLevel(level);
  if (ratio >= threshold) {
    return maxMultiplier;
  }
  return 1;
}

/**
 * Multiplier on uncollected idle (and on collect) for purchased collect-gem tiers.
 * Uses {@link COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE} tier `value` for that level count.
 */
export function getCollectGemIdleSecondsMultiplier(shop: ShopState): number {
  return COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.currentValue(shop);
}

export function formatShopUpgradeDescription(upgrade: ShopUpgradeDefinition, value: string): string {
  return upgrade.description.replace(SHOP_UPGRADE_DESCRIPTION_VALUE_PLACEHOLDER, value);
}

/**
 * Idle multiplier from Anti-consumerist: ramps linearly from ×1 at last idle/real shop purchase to tier `value` after `value2` seconds (wall clock).
 * Gem-priced shop purchases do not update {@link ShopState.last_purchase}. Requires finite `wallClockMs`; otherwise returns 0.
 */
export function getAntiConsumeristMultiplier(shop: ShopState, wallClockMs: number): number {
  if (!Number.isFinite(wallClockMs)) {
    return 0;
  }
  const level = ANTI_CONSUMERIST_SHOP_UPGRADE.currentLevel(shop);
  if (level <= 0) {
    return 0;
  }
  const tier = ANTI_CONSUMERIST_SHOP_UPGRADE.levels[level - 1];
  const maxBonus = safeNumber(tier?.value, 0);
  const durationSec = safeNaturalNumber(tier?.value2, 1);
  const lastPurchaseUtcSeconds = shop.last_purchase;
  if (!Number.isFinite(lastPurchaseUtcSeconds)) {
    return 0;
  }
  const lastMs = Math.floor(lastPurchaseUtcSeconds as number) * 1000;
  const elapsedSec = Math.max(0, (wallClockMs - lastMs) / 1000);
  const progress = durationSec <= 0 ? 1 : Math.min(1, elapsedSec / durationSec);
  return Math.max(0, maxBonus) * progress;
}

/**
 * How many distinct idle-priced shop lines (other than Consolidation) have at least one tier purchased.
 */
export function countIdleShopUpgradeTypesForConsolidation(shop: ShopState): number {
  let n = 0;
  for (const upgrade of SHOP_UPGRADES) {
    if (upgrade.currencyType !== SHOP_CURRENCY_TYPES.IDLE) {
      continue;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.CONSOLIDATION) {
      continue;
    }
    if (upgrade.currentLevel(shop) > 0) {
      n += 1;
    }
  }
  return n;
}

/** Additive collection-rate bonus from Consolidation when {@link countIdleShopUpgradeTypesForConsolidation} is at most the current tier's `value2`. */
export function getConsolidationBonus(shop: ShopState): number {
  const level = CONSOLIDATION_SHOP_UPGRADE.currentLevel(shop);
  if (level <= 0) {
    return 0;
  }
  const tier = CONSOLIDATION_SHOP_UPGRADE.levels[level - 1];
  const maxOtherTypes = safeNaturalNumber(tier?.value2, 0);
  const bonus = safeNumber(tier?.value, 0);
  if (maxOtherTypes <= 0 || !(bonus > 0)) {
    return 0;
  }
  const count = countIdleShopUpgradeTypesForConsolidation(shop);
  return count <= maxOtherTypes ? bonus : 0;
}

/**
 * Additive idle rate bonus from Quick Collector while real-time elapsed since last collect is strictly below the tier's `value2` (seconds).
 * No bonus once elapsed ≥ `value2`.
 */
export function getQuickCollectorBonus(shop: ShopState, secondsSinceLastCollection: number): number {
  const level = QUICK_COLLECTOR_SHOP_UPGRADE.currentLevel(shop);
  if (level <= 0) {
    return 0;
  }
  const tier = QUICK_COLLECTOR_SHOP_UPGRADE.levels[level - 1];
  const bonus = safeNumber(tier?.value, 0);
  const thresholdSec = safeNaturalNumber(tier?.value2, 1);
  if (!(bonus > 0) || thresholdSec <= 0) {
    return 0;
  }
  const elapsed = safeNaturalNumber(secondsSinceLastCollection);
  return elapsed < thresholdSec ? bonus : 0;
}

export {
  getIdleShopCostTable,
  getRealShopCostTable,
  getShopCurrencyCostAtPurchaseIndex,
  getShopCurrencyTierPurchaseCostSum,
  getTotalShopCurrencySpentForPurchaseCount,
  getMaxShopPurchasesForCurrency
} from "./shopCurrencyCostTable.js";
