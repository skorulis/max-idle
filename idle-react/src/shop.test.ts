import { describe, expect, it } from "vitest";
import { multiplierToLevel } from "./shop";
import { SECONDS_MULTIPLIER_SHOP_UPGRADE } from "./shopUpgrades";

function getTotalUpgradeCost(upgradeLevel: number, quantity: number): number {
  const safeLevel = Math.max(0, Math.floor(Number(upgradeLevel) || 0));
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  let total = 0;
  for (let i = 0; i < safeQuantity; i += 1) {
    total += SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(safeLevel + i);
  }
  return total;
}

describe("shop pricing", () => {
  it("uses per-level costs from the seconds multiplier table", () => {
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(0)).toBe(20);
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(1)).toBe(60);
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(2)).toBe(120);
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(3)).toBe(300);
  });

  it("calculates cumulative bundle costs", () => {
    expect(getTotalUpgradeCost(0, 1)).toBe(20);
    expect(getTotalUpgradeCost(0, 5)).toBe(20 + 60 + 120 + 300 + 600);
    expect(getTotalUpgradeCost(3, 2)).toBe(300 + 600);
  });

  it("derives level from multiplier", () => {
    expect(multiplierToLevel(1)).toBe(0);
    expect(multiplierToLevel(1.4)).toBe(4);
  });
});
