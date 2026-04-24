import { LUCK_SHOP_UPGRADE, RESTRAINT_SHOP_UPGRADE, SECONDS_MULTIPLIER_SHOP_UPGRADE } from "./shopUpgrades.js";

const DEFAULT_SECONDS_MULTIPLIER_LEVEL = 0;
const DEFAULT_SECONDS_MULTIPLIER_VALUE = 1;

export type ShopState = {
  seconds_multiplier: number;
  restraint: boolean;
  luck: boolean;
  [key: string]: unknown;
};

function clampSecondsMultiplierLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return DEFAULT_SECONDS_MULTIPLIER_LEVEL;
  }
  return Math.max(DEFAULT_SECONDS_MULTIPLIER_LEVEL, Math.min(getSecondsMultiplierMaxLevel(), Math.floor(level)));
}

export function getSecondsMultiplierMaxLevel(): number {
  return SECONDS_MULTIPLIER_SHOP_UPGRADE.levels.length;
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
  return clampSecondsMultiplierLevel(shop.seconds_multiplier);
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
  return shop.restraint;
}

export function withRestraint(shop: ShopState, enabled: boolean): ShopState {
  return {
    ...shop,
    restraint: enabled === true
  };
}

export function getRestraintUpgradeCost(): number {
  return RESTRAINT_SHOP_UPGRADE.levels[0]?.cost ?? 0;
}

export function getLuckEnabled(shop: ShopState): boolean {
  return shop.luck;
}

export function withLuck(shop: ShopState, enabled: boolean): ShopState {
  return {
    ...shop,
    luck: enabled === true
  };
}

export function getLuckUpgradeCost(): number {
  return LUCK_SHOP_UPGRADE.levels[0]?.cost ?? 0;
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
  const safeLevel = clampSecondsMultiplierLevel(currentLevel);
  return SECONDS_MULTIPLIER_SHOP_UPGRADE.levels[safeLevel]?.cost ?? 0;
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
