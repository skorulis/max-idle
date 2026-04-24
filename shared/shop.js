const BASE_SECONDS_MULTIPLIER_COST = 5;
const SECONDS_MULTIPLIER_COST_GROWTH = 1.4;
const DEFAULT_SECONDS_MULTIPLIER = 1;
const RESTRAINT_UPGRADE_COST = 5 * 60 * 60;

export function normalizeShopState(shop) {
  const rawShop = shop && typeof shop === "object" && !Array.isArray(shop) ? shop : {};
  const parsedSecondsMultiplier = Number(rawShop.seconds_multiplier);
  const secondsMultiplier =
    Number.isFinite(parsedSecondsMultiplier) && parsedSecondsMultiplier > 0
      ? parsedSecondsMultiplier
      : DEFAULT_SECONDS_MULTIPLIER;
  const restraint = rawShop.restraint === true;
  return {
    ...rawShop,
    seconds_multiplier: secondsMultiplier,
    restraint
  };
}

export function getSecondsMultiplier(shop) {
  return normalizeShopState(shop).seconds_multiplier;
}

export function withSecondsMultiplier(shop, secondsMultiplier) {
  const nextSecondsMultiplier =
    Number.isFinite(secondsMultiplier) && secondsMultiplier > 0
      ? secondsMultiplier
      : DEFAULT_SECONDS_MULTIPLIER;
  return {
    ...normalizeShopState(shop),
    seconds_multiplier: nextSecondsMultiplier
  };
}

export function getRestraintEnabled(shop) {
  return normalizeShopState(shop).restraint;
}

export function withRestraint(shop, enabled) {
  return {
    ...normalizeShopState(shop),
    restraint: enabled === true
  };
}

export function getRestraintUpgradeCost() {
  return RESTRAINT_UPGRADE_COST;
}

export function multiplierToLevel(secondsMultiplier) {
  if (!Number.isFinite(secondsMultiplier) || secondsMultiplier <= 1) {
    return 0;
  }
  return Math.max(0, Math.round((secondsMultiplier - 1) * 10));
}

export function levelToMultiplier(level) {
  const safeLevel = Math.max(0, Math.floor(level));
  return Number((1 + safeLevel / 10).toFixed(1));
}

export function getSecondsMultiplierUpgradeCost(currentLevel) {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  let cost = BASE_SECONDS_MULTIPLIER_COST;
  for (let i = 0; i < safeLevel; i += 1) {
    cost = Math.floor(cost * SECONDS_MULTIPLIER_COST_GROWTH);
  }
  return cost;
}

export function getSecondsMultiplierPurchaseCost(currentLevel, quantity) {
  const safeQuantity = Math.max(0, Math.floor(quantity));
  let totalCost = 0;
  for (let i = 0; i < safeQuantity; i += 1) {
    totalCost += getSecondsMultiplierUpgradeCost(currentLevel + i);
  }
  return totalCost;
}
