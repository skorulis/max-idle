import { describe, expect, it } from "vitest";
import {
  getLuckEnabled,
  levelToMultiplier,
  multiplierToLevel
} from "../src/shop.js";
import { LUCK_SHOP_UPGRADE, PATIENCE_SHOP_UPGRADE, RESTRAINT_SHOP_UPGRADE, SECONDS_MULTIPLIER_SHOP_UPGRADE } from "@maxidle/shared/shopUpgrades";

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
  const baseShop = { seconds_multiplier: 0, restraint: 0, luck: 0 };

  it("uses per-level costs from the seconds multiplier table", () => {
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(0)).toBe(60);
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(1)).toBe(120);
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(2)).toBe(300);
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(3)).toBe(30 * 60);
  });

  it("calculates cumulative bundle purchase cost", () => {
    expect(getTotalUpgradeCost(0, 1)).toBe(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(0));
    expect(getTotalUpgradeCost(0, 5)).toBe(SECONDS_MULTIPLIER_SHOP_UPGRADE.levels.slice(0, 5).reduce((sum, level) => sum + level.cost, 0));
    expect(getTotalUpgradeCost(3, 2)).toBe(
      SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(3) + SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(4)
    );
  });

  it("maps levels and multipliers consistently", () => {
    expect(multiplierToLevel(1)).toBe(0);
    expect(multiplierToLevel(1.3)).toBe(3);
    expect(levelToMultiplier(0)).toBe(1);
    expect(levelToMultiplier(7)).toBe(1.7);
  });

  it("uses fixed restraint upgrade cost", () => {
    expect(RESTRAINT_SHOP_UPGRADE.costAtLevel(0)).toBe(2 * 60 * 60);
  });

  it("uses fixed luck upgrade cost", () => {
    expect(LUCK_SHOP_UPGRADE.costAtLevel(0)).toBe(7 * 24 * 60 * 60);
  });

  it("uses escalating patience upgrade costs", () => {
    expect(PATIENCE_SHOP_UPGRADE.costAtLevel(0)).toBe(60);
    expect(PATIENCE_SHOP_UPGRADE.costAtLevel(1)).toBe(5 * 60);
  });
});
