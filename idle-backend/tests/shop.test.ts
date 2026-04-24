import { describe, expect, it } from "vitest";
import {
  getLuckEnabled,
  getLuckUpgradeCost,
  getRestraintUpgradeCost,
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  levelToMultiplier,
  multiplierToLevel,
  withLuck,
  withRestraint
} from "../src/shop.js";

describe("shop pricing", () => {
  const baseShop = { seconds_multiplier: 0, restraint: false, luck: false };

  it("calculates compounding per-step costs with floor", () => {
    expect(getSecondsMultiplierUpgradeCost(0)).toBe(5);
    expect(getSecondsMultiplierUpgradeCost(1)).toBe(7);
    expect(getSecondsMultiplierUpgradeCost(2)).toBe(9);
    expect(getSecondsMultiplierUpgradeCost(3)).toBe(12);
  });

  it("calculates cumulative bundle purchase cost", () => {
    expect(getSecondsMultiplierPurchaseCost(0, 1)).toBe(5);
    expect(getSecondsMultiplierPurchaseCost(0, 5)).toBe(5 + 7 + 9 + 12 + 16);
    expect(getSecondsMultiplierPurchaseCost(3, 2)).toBe(12 + 16);
  });

  it("maps levels and multipliers consistently", () => {
    expect(multiplierToLevel(1)).toBe(0);
    expect(multiplierToLevel(1.3)).toBe(3);
    expect(levelToMultiplier(0)).toBe(1);
    expect(levelToMultiplier(7)).toBe(1.7);
  });

  it("uses fixed restraint upgrade cost", () => {
    expect(getRestraintUpgradeCost()).toBe(2 * 60 * 60);
  });

  it("uses fixed luck upgrade cost", () => {
    expect(getLuckUpgradeCost()).toBe(7 * 24 * 60 * 60);
  });
});
