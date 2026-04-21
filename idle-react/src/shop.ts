const BASE_SECONDS_MULTIPLIER_COST = 5;
const SECONDS_MULTIPLIER_COST_GROWTH = 1.4;

export function multiplierToLevel(secondsMultiplier: number): number {
  if (!Number.isFinite(secondsMultiplier) || secondsMultiplier <= 1) {
    return 0;
  }
  return Math.max(0, Math.round((secondsMultiplier - 1) * 10));
}

export function getSecondsMultiplierUpgradeCost(currentLevel: number): number {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  let cost = BASE_SECONDS_MULTIPLIER_COST;
  for (let i = 0; i < safeLevel; i += 1) {
    cost = Math.floor(cost * SECONDS_MULTIPLIER_COST_GROWTH);
  }
  return cost;
}

export function getSecondsMultiplierPurchaseCost(currentLevel: number, quantity: number): number {
  const safeQuantity = Math.max(0, Math.floor(quantity));
  let totalCost = 0;
  for (let i = 0; i < safeQuantity; i += 1) {
    totalCost += getSecondsMultiplierUpgradeCost(currentLevel + i);
  }
  return totalCost;
}
