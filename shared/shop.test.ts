import { describe, expect, it } from "vitest";
import {
  getDefaultShopState,
  getLevelBonusIdleContribution,
  getWorthwhileAchievementsMultiplier,
  withShopUpgradeLevel
} from "./shop.js";
import { SHOP_UPGRADE_IDS } from "./shopUpgrades.js";

describe("getWorthwhileAchievementsMultiplier", () => {
  it("returns 0 when Worthwhile Achievements has no tier", () => {
    const shop = getDefaultShopState();
    expect(getWorthwhileAchievementsMultiplier(shop, 0)).toBe(0);
    expect(getWorthwhileAchievementsMultiplier(shop, 100)).toBe(1);
  });

  it("returns per-achievement bonus times count for tier 1", () => {
    const shop = withShopUpgradeLevel(
      getDefaultShopState(),
      SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
      1
    );
    expect(getWorthwhileAchievementsMultiplier(shop, 100)).toBe(2);
  });

  it("uses the current tier value", () => {
    const shop = withShopUpgradeLevel(
      getDefaultShopState(),
      SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
      2
    );
    expect(getWorthwhileAchievementsMultiplier(shop, 50)).toBe(1.5);
  });

  it("returns 0 when achievement count is 0", () => {
    const shop = withShopUpgradeLevel(
      getDefaultShopState(),
      SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
      1
    );
    expect(getWorthwhileAchievementsMultiplier(shop, 0)).toBe(0);
  });

  it("floors fractional achievement counts", () => {
    const shop = withShopUpgradeLevel(
      getDefaultShopState(),
      SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
      1
    );
    expect(getWorthwhileAchievementsMultiplier(shop, 10.9)).toBeCloseTo(0.2);
  });

  it("treats negative counts as 0", () => {
    const shop = withShopUpgradeLevel(
      getDefaultShopState(),
      SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
      1
    );
    expect(getWorthwhileAchievementsMultiplier(shop, -3)).toBe(0);
  });

  it("treats non-finite achievement counts as 0", () => {
    const shop = withShopUpgradeLevel(
      getDefaultShopState(),
      SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
      1
    );
    expect(getWorthwhileAchievementsMultiplier(shop, Number.NaN)).toBe(0);
    expect(getWorthwhileAchievementsMultiplier(shop, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("getLevelBonusIdleContribution", () => {
  it("returns 0 when Level bonus has no tier purchased", () => {
    const shop = getDefaultShopState();
    expect(getLevelBonusIdleContribution(shop, 10)).toBe(0);
  });

  it("returns bonus per level × player level for tier ≥ 1", () => {
    const shop = withShopUpgradeLevel(getDefaultShopState(), SHOP_UPGRADE_IDS.LEVEL_BONUS, 1);
    expect(getLevelBonusIdleContribution(shop, 5)).toBeCloseTo(1.0, 10);
  });

  it("floors fractional player levels", () => {
    const shop = withShopUpgradeLevel(getDefaultShopState(), SHOP_UPGRADE_IDS.LEVEL_BONUS, 1);
    expect(getLevelBonusIdleContribution(shop, 5.9)).toBeCloseTo(1.0, 10);
  });
});
