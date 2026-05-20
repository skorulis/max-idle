import { describe, expect, it } from "vitest";
import {
  applyLegacyShopUpgradeRefunds,
  getDefaultShopState,
  getLevelBonusIdleContribution,
  getRecordedShopCurrencySpent,
  getShopPurchaseRefundTotals,
  getTotalShopCurrencySpentForPurchaseCount,
  getWorthwhileAchievementsMultiplier,
  withIdleCurrencyShopUpgradesReset,
  withRealCurrencyShopUpgradesReset,
  withShopCurrencySpentAdded,
  withShopUpgradeLevel
} from "./shop.js";
import { SHOP_CURRENCY_TYPES, SHOP_UPGRADE_IDS } from "./shopUpgrades.js";

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
  it("returns 0.5 when Level bonus has no tier purchased", () => {
    const shop = getDefaultShopState();
    expect(getLevelBonusIdleContribution(shop, 10)).toBe(0.5);
  });

  it("returns bonus per level × player level for tier ≥ 1", () => {
    const shop = withShopUpgradeLevel(getDefaultShopState(), SHOP_UPGRADE_IDS.LEVEL_BONUS, 1);
    expect(getLevelBonusIdleContribution(shop, 5)).toBeCloseTo(0.5, 10);
  });

  it("floors fractional player levels", () => {
    const shop = withShopUpgradeLevel(getDefaultShopState(), SHOP_UPGRADE_IDS.LEVEL_BONUS, 1);
    expect(getLevelBonusIdleContribution(shop, 5.9)).toBeCloseTo(0.5, 10);
  });
});

describe("applyLegacyShopUpgradeRefunds", () => {
  it("does nothing when no legacy upgrade tiers are owned", () => {
    const shop = getDefaultShopState();
    const result = applyLegacyShopUpgradeRefunds(shop);
    expect(result.realRefund).toBe(0);
    expect(result.idleRefund).toBe(0);
    expect(result.refundedUpgradeIds).toEqual([]);
  });
});

describe("shop currency spent tracking", () => {
  it("accumulates recorded spend on purchase", () => {
    let shop = getDefaultShopState();
    shop = withShopCurrencySpentAdded(shop, SHOP_CURRENCY_TYPES.IDLE, 100);
    shop = withShopCurrencySpentAdded(shop, SHOP_CURRENCY_TYPES.IDLE, 50);
    expect(getRecordedShopCurrencySpent(shop, SHOP_CURRENCY_TYPES.IDLE)).toBe(150);
  });

  it("refunds max of recalculated total and recorded spend", () => {
    const shop = withShopUpgradeLevel(
      {
        ...getDefaultShopState(),
        idle_currency_spent: 500
      },
      SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER,
      1
    );
    const calculated = getTotalShopCurrencySpentForPurchaseCount(SHOP_CURRENCY_TYPES.IDLE, 1);
    expect(calculated).toBeLessThan(500);
    expect(getShopPurchaseRefundTotals(shop).idle).toBe(500);
  });

  it("clears recorded idle spend on idle refund reset", () => {
    const shop = withIdleCurrencyShopUpgradesReset({
      ...getDefaultShopState(),
      idle_currency_spent: 999,
      [SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER]: 2
    });
    expect(shop.idle_currency_spent).toBe(0);
    expect(shop.seconds_multiplier).toBe(0);
  });

  it("clears recorded real spend on real refund reset", () => {
    const shop = withRealCurrencyShopUpgradesReset({
      ...getDefaultShopState(),
      real_currency_spent: 888,
      [SHOP_UPGRADE_IDS.LUCK]: 1
    });
    expect(shop.real_currency_spent).toBe(0);
    expect(shop.luck).toBe(0);
  });
});
