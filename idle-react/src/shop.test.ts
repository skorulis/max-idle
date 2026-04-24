import { describe, expect, it } from "vitest";
import {
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  multiplierToLevel
} from "./shop";

describe("shop pricing", () => {
  it("uses per-level costs from the seconds multiplier table", () => {
    expect(getSecondsMultiplierUpgradeCost(0)).toBe(20);
    expect(getSecondsMultiplierUpgradeCost(1)).toBe(60);
    expect(getSecondsMultiplierUpgradeCost(2)).toBe(120);
    expect(getSecondsMultiplierUpgradeCost(3)).toBe(300);
  });

  it("calculates cumulative bundle costs", () => {
    expect(getSecondsMultiplierPurchaseCost(0, 1)).toBe(20);
    expect(getSecondsMultiplierPurchaseCost(0, 5)).toBe(20 + 60 + 120 + 300 + 600);
    expect(getSecondsMultiplierPurchaseCost(3, 2)).toBe(300 + 600);
  });

  it("derives level from multiplier", () => {
    expect(multiplierToLevel(1)).toBe(0);
    expect(multiplierToLevel(1.4)).toBe(4);
  });
});
