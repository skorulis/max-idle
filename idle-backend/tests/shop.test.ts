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

  it("uses per-level costs from the seconds multiplier table", () => {
    expect(getSecondsMultiplierUpgradeCost(0)).toBe(20);
    expect(getSecondsMultiplierUpgradeCost(1)).toBe(60);
    expect(getSecondsMultiplierUpgradeCost(2)).toBe(120);
    expect(getSecondsMultiplierUpgradeCost(3)).toBe(300);
  });

  it("calculates cumulative bundle purchase cost", () => {
    expect(getSecondsMultiplierPurchaseCost(0, 1)).toBe(20);
    expect(getSecondsMultiplierPurchaseCost(0, 5)).toBe(20 + 60 + 120 + 300 + 600);
    expect(getSecondsMultiplierPurchaseCost(3, 2)).toBe(300 + 600);
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
