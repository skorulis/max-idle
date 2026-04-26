import {
  COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  IDLE_HOARDER_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  SHOP_UPGRADES,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS
} from "./shopUpgrades.js";
import type { ShopUpgradeDefinition } from "./shopUpgrades.js";

const DEFAULT_SECONDS_MULTIPLIER_LEVEL = 0;
const DEFAULT_SECONDS_MULTIPLIER_VALUE = 1;

export type ShopState = {
  seconds_multiplier: number;
  restraint: number;
  idle_hoarder?: number;
  luck: number;
  /** Resets to 0 on collect. Same key as {@link SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST}. */
  collect_gem_time_boost?: number;
  [key: string]: unknown;
};

export const DEFAULT_SHOP_STATE: ShopState = {
  [SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER]: 0,
  [SHOP_UPGRADE_IDS.RESTRAINT]: 0,
  [SHOP_UPGRADE_IDS.IDLE_HOARDER]: 0,
  [SHOP_UPGRADE_IDS.LUCK]: 0,
  [SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST]: 0
};

export function getDefaultShopState(): ShopState {
  return { ...DEFAULT_SHOP_STATE };
}

function clampSecondsMultiplierLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return DEFAULT_SECONDS_MULTIPLIER_LEVEL;
  }
  return Math.max(DEFAULT_SECONDS_MULTIPLIER_LEVEL, Math.min(getSecondsMultiplierMaxLevel(), Math.floor(level)));
}

export function getSecondsMultiplierMaxLevel(): number {
  return SECONDS_MULTIPLIER_SHOP_UPGRADE.maxLevel();
}

export function getCollectGemBoostLevel(shop: ShopState): number {
  return COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.currentLevel(shop);
}

export function withCollectGemBoostLevel(shop: ShopState, level: number): ShopState {
  const safe = Number.isFinite(level)
    ? Math.max(0, Math.min(COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.maxLevel(), Math.floor(level)))
    : 0;
  return {
    ...shop,
    [SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST]: safe
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

export function getSecondsMultiplierLevel(shop: ShopState): number {
  return SECONDS_MULTIPLIER_SHOP_UPGRADE.currentLevel(shop);
}

export function getSecondsMultiplier(shop: ShopState): number {
  return getSecondsMultiplierUpgradeValue(getSecondsMultiplierLevel(shop));
}

export function withSecondsMultiplier(shop: ShopState, secondsMultiplierLevel: number): ShopState {
  return {
    ...shop,
    seconds_multiplier: clampSecondsMultiplierLevel(secondsMultiplierLevel)
  };
}

export function getRestraintEnabled(shop: ShopState): boolean {
  return getRestraintLevel(shop) > 0;
}

export function getRestraintMaxLevel(): number {
  return RESTRAINT_SHOP_UPGRADE.maxLevel();
}

export function getRestraintLevel(shop: ShopState): number {
  return RESTRAINT_SHOP_UPGRADE.currentLevel(shop);
}

export function getRestraintBonusMultiplier(shop: ShopState): number {
  const restraintLevel = getRestraintLevel(shop);
  if (restraintLevel <= 0) {
    return 1;
  }
  return RESTRAINT_SHOP_UPGRADE.levels[restraintLevel - 1]?.value ?? 1;
}

export function withRestraintLevel(shop: ShopState, restraintLevel: number): ShopState {
  const safeLevel = Number.isFinite(restraintLevel)
    ? Math.max(0, Math.min(getRestraintMaxLevel(), Math.floor(restraintLevel)))
    : 0;
  return {
    ...shop,
    restraint: safeLevel
  };
}

export function withRestraint(shop: ShopState, enabled: boolean): ShopState {
  return withRestraintLevel(shop, enabled ? 1 : 0);
}

export function getRestraintUpgradeCost(): number {
  return RESTRAINT_SHOP_UPGRADE.levels[0]?.cost ?? 0;
}

export function getRestraintUpgradeCostAtLevel(currentLevel: number): number {
  return RESTRAINT_SHOP_UPGRADE.costAtLevel(currentLevel);
}

export function getIdleHoarderLevel(shop: ShopState): number {
  return IDLE_HOARDER_SHOP_UPGRADE.currentLevel(shop);
}

export function withIdleHoarderLevel(shop: ShopState, idleHoarderLevel: number): ShopState {
  const safeLevel = Number.isFinite(idleHoarderLevel)
    ? Math.max(0, Math.min(getIdleHoarderMaxLevel(), Math.floor(idleHoarderLevel)))
    : 0;
  return {
    ...shop,
    [SHOP_UPGRADE_IDS.IDLE_HOARDER]: safeLevel
  };
}

export function getIdleHoarderUpgradeCostAtLevel(currentLevel: number): number {
  return IDLE_HOARDER_SHOP_UPGRADE.costAtLevel(currentLevel);
}

export function getIdleHoarderMaxLevel(): number {
  return IDLE_HOARDER_SHOP_UPGRADE.maxLevel();
}

export function getLuckEnabled(shop: ShopState): boolean {
  return getLuckLevel(shop) > 0;
}

export function getLuckMaxLevel(): number {
  return LUCK_SHOP_UPGRADE.maxLevel();
}

export function getLuckLevel(shop: ShopState): number {
  return LUCK_SHOP_UPGRADE.currentLevel(shop);
}

export function getLuckPreserveChance(shop: ShopState): number {
  const luckLevel = getLuckLevel(shop);
  if (luckLevel <= 0) {
    return 0;
  }
  return LUCK_SHOP_UPGRADE.levels[luckLevel - 1]?.value ?? 0;
}

export function withLuckLevel(shop: ShopState, luckLevel: number): ShopState {
  const safeLevel = Number.isFinite(luckLevel) ? Math.max(0, Math.min(getLuckMaxLevel(), Math.floor(luckLevel))) : 0;
  return {
    ...shop,
    luck: safeLevel
  };
}

export function withLuck(shop: ShopState, enabled: boolean): ShopState {
  return withLuckLevel(shop, enabled ? 1 : 0);
}

export function getLuckUpgradeCost(): number {
  return LUCK_SHOP_UPGRADE.levels[0]?.cost ?? 0;
}

export function getLuckUpgradeCostAtLevel(currentLevel: number): number {
  return LUCK_SHOP_UPGRADE.costAtLevel(currentLevel);
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

export function getSecondsMultiplierUpgradeCost(currentLevel: number): number {
  return SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(clampSecondsMultiplierLevel(currentLevel));
}

export function getSecondsMultiplierPurchaseCost(currentLevel: number, quantity: number): number {
  const safeLevel = clampSecondsMultiplierLevel(currentLevel);
  const safeQuantity = Math.max(0, Math.floor(quantity));
  if (safeLevel + safeQuantity > getSecondsMultiplierMaxLevel()) {
    return Number.POSITIVE_INFINITY;
  }
  let totalCost = 0;
  for (let i = 0; i < safeQuantity; i += 1) {
    totalCost += getSecondsMultiplierUpgradeCost(safeLevel + i);
  }
  return totalCost;
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
