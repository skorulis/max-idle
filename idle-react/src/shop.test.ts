import { describe, expect, it } from "vitest";
import {
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  multiplierToLevel
} from "./shop";

describe("shop pricing", () => {
  it("calculates per-step costs", () => {
    expect(getSecondsMultiplierUpgradeCost(0)).toBe(5);
    expect(getSecondsMultiplierUpgradeCost(1)).toBe(7);
    expect(getSecondsMultiplierUpgradeCost(2)).toBe(9);
    expect(getSecondsMultiplierUpgradeCost(3)).toBe(12);
  });

  it("calculates cumulative bundle costs", () => {
    expect(getSecondsMultiplierPurchaseCost(0, 1)).toBe(5);
    expect(getSecondsMultiplierPurchaseCost(0, 5)).toBe(49);
    expect(getSecondsMultiplierPurchaseCost(3, 2)).toBe(28);
  });

  it("derives level from multiplier", () => {
    expect(multiplierToLevel(1)).toBe(0);
    expect(multiplierToLevel(1.4)).toBe(4);
  });
});
