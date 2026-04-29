import { formatSeconds } from "../formatSeconds";
import {
  Atom,
  Clock3,
  Gem,
  Plus,
} from "lucide-react";
import { useState } from "react";
import type { SyncedPlayerState } from "../app/types";
import { safeNaturalNumber } from "@maxidle/shared/safeNumber";
import {
  formatShopUpgradeDescription,
  getCollectGemTimeBoostMaxLevel,
  getCollectGemTimeBoostUpgradeCostAtLevel,
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS,
  SHOP_UPGRADES,
  type ShopUpgradeDefinition,
  type ShopUpgradeId
} from "../shopUpgrades";
import type { ShopCurrencyType } from "../shopUpgrades";
import {
  getWorthwhileAchievementsMultiplier,
  hasRefundableShopPurchases,
  withShopUpgradeLevel
} from "../shop";
import { getIdleSecondsRate } from "../idleRate";
import GameIcon from "../GameIcon";
import { getLucidIcon } from "../getLucidIcon";

type ShopPageProps = {
  playerState: SyncedPlayerState | null;
  shopPendingQuantity:
    | "seconds_multiplier"
    | "another_seconds_multiplier"
    | "patience"
    | "restraint"
    | "idle_hoarder"
    | "worthwhile_achievements"
    | "luck"
    | "extra_realtime_wait"
    | "collect_gem_time_boost"
    | "purchase_refund"
    | null;
  /** Purchase flow for any shop upgrade row; `upgradeId` matches {@link SHOP_UPGRADE_IDS}. */
  onPurchase: (upgradeId: ShopUpgradeId) => Promise<void>;
  onNavigateHome: () => void;
};

function getCurrencyAmount(playerState: SyncedPlayerState, currencyType: ShopCurrencyType): number {
  if (currencyType === SHOP_CURRENCY_TYPES.IDLE) {
    return playerState.idleTime.available;
  }
  if (currencyType === SHOP_CURRENCY_TYPES.REAL) {
    return playerState.realTime.available;
  }
  return playerState.timeGems.available;
}

function formatUpgradeCost(currencyType: ShopCurrencyType, amount: number): string {
  if (currencyType === SHOP_CURRENCY_TYPES.GEM) {
    return amount.toString();
  }
  return formatSeconds(amount);
}

function formatMultiplier(value: number): string {
  return `${value.toFixed(1)}x`;
}

function formatChance(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatUpgradeValue(upgrade: ShopUpgradeDefinition, value: number): string {
  if (upgrade.id === SHOP_UPGRADE_IDS.LUCK) {
    return formatChance(value);
  }
  if (
    upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER ||
    (upgrade.id as string) === "another_seconds_multiplier" ||
    upgrade.id === SHOP_UPGRADE_IDS.RESTRAINT ||
    upgrade.id === SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST
  ) {
    return formatMultiplier(value);
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS) {
    return `${value.toFixed(2)}×`;
  }
  return value.toString();
}

function formatValueDescription(upgrade: ShopUpgradeDefinition, value: number): string {
  const valueDescription = (upgrade as ShopUpgradeDefinition & { valueDescription?: string | null }).valueDescription;
  if (!valueDescription) {
    return "";
  }
  return valueDescription.replace("%s", formatUpgradeValue(upgrade, value));
}

export function ShopPage({
  playerState,
  shopPendingQuantity,
  onPurchase,
  onNavigateHome
}: ShopPageProps) {
  const [selectedCurrencyType, setSelectedCurrencyType] = useState<ShopCurrencyType>(SHOP_CURRENCY_TYPES.IDLE);

  if (!playerState) {
    return (
      <>
        <p>Start idling to unlock the shop.</p>
        <button type="button" className="secondary" onClick={onNavigateHome}>
          Go to Home
        </button>
      </>
    );
  }

  const syncedPlayer = playerState;

  const visibleUpgrades = SHOP_UPGRADES.filter((upgrade) => upgrade.currencyType === selectedCurrencyType);
  const secondsMultiplierLevel = SECONDS_MULTIPLIER_SHOP_UPGRADE.currentLevel(syncedPlayer.shop);
  const hasRefundablePurchases = hasRefundableShopPurchases(syncedPlayer.shop);

  function getValueDesciptionValue(upgrade: ShopUpgradeDefinition, playerState: SyncedPlayerState, level: number): number | null {
    const valueDescription = upgrade.valueDescription;
    if (typeof valueDescription !== "string" || valueDescription.length === 0) {
      return null;
    }
    if (level <= 0 || level > upgrade.maxLevel()) {
      return null;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS) {
      const achievementCount = safeNaturalNumber(playerState.achievementCount);
      return getWorthwhileAchievementsMultiplier(
        withShopUpgradeLevel(playerState.shop, SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS, level),
        achievementCount
      );
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.PATIENCE) {
      const patienceShop = withShopUpgradeLevel(playerState.shop, SHOP_UPGRADE_IDS.PATIENCE, level);
      return getIdleSecondsRate({
        secondsSinceLastCollection: Number.MAX_SAFE_INTEGER,
        shop: patienceShop,
        achievementCount: playerState.achievementCount,
        realTimeAvailable: playerState.realTime.available
      });
    }
    
    return upgrade.levels[level - 1]?.value ?? null
  }

  function getUpgradeRowState(upgrade: ShopUpgradeDefinition): {
    description: string;
    currentValueDescription: string | null;
    nextValueDescription: string | null;
    cost: number | null;
    isPending: boolean;
    isOwned: boolean;
    onPurchase: () => Promise<void>;
  } {
    const purchasedLevel = getUpgradeCurrentLevel(upgrade) ?? 0;
    const currentValueForDescription = getValueDesciptionValue(upgrade, syncedPlayer, purchasedLevel);
    const nextValueForDescription = getValueDesciptionValue(upgrade, syncedPlayer, purchasedLevel + 1);
    
    const currentValueDescription =
      currentValueForDescription !== null
        ? formatValueDescription(upgrade, currentValueForDescription)
        : null;
    const nextValueDescription =
      nextValueForDescription !== null
        ? formatValueDescription(upgrade, nextValueForDescription)
        : null;

    if (upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER) {
      return {
        description: upgrade.description,
        currentValueDescription,
        nextValueDescription,
        cost: upgrade.costAtLevel(secondsMultiplierLevel),
        isPending: shopPendingQuantity === upgrade.id,
        isOwned: secondsMultiplierLevel >= upgrade.maxLevel(),
        onPurchase: () => onPurchase(upgrade.id)
      };
    }

    if (upgrade.id === SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT) {
      const level = upgrade.levels[0] ?? null;
      return {
        description: level
          ? formatShopUpgradeDescription(upgrade, formatSeconds(level.value, 2, "floor"))
          : upgrade.description,
        currentValueDescription,
        nextValueDescription,
        cost: level?.cost ?? null,
        isPending: shopPendingQuantity === upgrade.id,
        isOwned: false,
        onPurchase: () => onPurchase(upgrade.id)
      };
    }

    if (upgrade.id === SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST) {
      const collectGemBoostLevel = upgrade.currentLevel(syncedPlayer.shop);
      const maxCollectGemBoostLevel = getCollectGemTimeBoostMaxLevel();
      const nextLevelDef = upgrade.levels[collectGemBoostLevel] ?? null;
      return {
        description: nextLevelDef ? upgrade.description : "Maximum level reached.",
        currentValueDescription,
        nextValueDescription,
        cost: getCollectGemTimeBoostUpgradeCostAtLevel(collectGemBoostLevel) || null,
        isPending: shopPendingQuantity === upgrade.id,
        isOwned: collectGemBoostLevel >= maxCollectGemBoostLevel,
        onPurchase: () => onPurchase(upgrade.id)
      };
    }

    if (upgrade.id === SHOP_UPGRADE_IDS.PURCHASE_REFUND) {
      return {
        description: upgrade.description,
        currentValueDescription,
        nextValueDescription,
        cost: upgrade.levels[0]?.cost ?? null,
        isPending: shopPendingQuantity === upgrade.id,
        isOwned: false,
        onPurchase: () => onPurchase(upgrade.id)
      };
    }

    const currentLevel = upgrade.currentLevel(syncedPlayer.shop);
    const maxLevel = upgrade.maxLevel();
    const isOwned = currentLevel >= maxLevel;
    const isPending = shopPendingQuantity === upgrade.id;
    const nextLevel = upgrade.levels[currentLevel] ?? null;
    return {
      description:
        isOwned
            ? "Maximum level reached."
            : upgrade.description,
      currentValueDescription,
      nextValueDescription,
      cost: nextLevel?.cost ?? null,
      isPending,
      isOwned,
      onPurchase: () => onPurchase(upgrade.id)
    };
  }

  function getUpgradeCurrentLevel(upgrade: ShopUpgradeDefinition): number | null {
    if (upgrade.levels.length <= 1) {
      return null;
    }
    return upgrade.currentLevel(syncedPlayer.shop);
  }

  return (
    <>
      <h2>Shop</h2>
      <div className="shop-currencies">
        <button
          type="button"
          className={`shop-currency-card shop-currency-button${
            selectedCurrencyType === SHOP_CURRENCY_TYPES.IDLE ? " shop-currency-card-active" : ""
          }`}
          onClick={() => setSelectedCurrencyType(SHOP_CURRENCY_TYPES.IDLE)}
          aria-pressed={selectedCurrencyType === SHOP_CURRENCY_TYPES.IDLE}
        >
          <p className="shop-currency-title">
            <Atom size={16} aria-hidden="true" />
            Idle Time
          </p>
          <p className="shop-currency-value">{formatSeconds(syncedPlayer.idleTime.available, 2, "floor")}</p>
        </button>
        <button
          type="button"
          className={`shop-currency-card shop-currency-button${
            selectedCurrencyType === SHOP_CURRENCY_TYPES.REAL ? " shop-currency-card-active" : ""
          }`}
          onClick={() => setSelectedCurrencyType(SHOP_CURRENCY_TYPES.REAL)}
          aria-pressed={selectedCurrencyType === SHOP_CURRENCY_TYPES.REAL}
        >
          <p className="shop-currency-title">
            <Clock3 size={16} aria-hidden="true" />
            Real Time
          </p>
          <p className="shop-currency-value">{formatSeconds(syncedPlayer.realTime.available, 2, "floor")}</p>
        </button>
        <button
          type="button"
          className={`shop-currency-card shop-currency-button${
            selectedCurrencyType === SHOP_CURRENCY_TYPES.GEM ? " shop-currency-card-active" : ""
          }`}
          onClick={() => setSelectedCurrencyType(SHOP_CURRENCY_TYPES.GEM)}
          aria-pressed={selectedCurrencyType === SHOP_CURRENCY_TYPES.GEM}
        >
          <p className="shop-currency-title">
            <Gem size={16} aria-hidden="true" />
            Time Gems
          </p>
          <p className="shop-currency-value">{syncedPlayer.timeGems.available}</p>
        </button>
      </div>
      {selectedCurrencyType === SHOP_CURRENCY_TYPES.IDLE ? (
        <p className="subtle">Current multiplier: {syncedPlayer.secondsMultiplier.toFixed(1)}x</p>
      ) : null}
      {visibleUpgrades.length === 0 ? (
        <p className="subtle">No upgrades currently available for this currency.</p>
      ) : (
        <div className="shop-upgrade-list">
          {visibleUpgrades.map((upgrade) => {
            const upgradeState = getUpgradeRowState(upgrade);
            const currentLevel = getUpgradeCurrentLevel(upgrade);
            const upgradeAvailableBalance = getCurrencyAmount(syncedPlayer, upgrade.currencyType);
            const cannotAfford = upgradeState.cost !== null && upgradeAvailableBalance < upgradeState.cost;
            const refundUnavailable =
              upgrade.id === SHOP_UPGRADE_IDS.PURCHASE_REFUND && !hasRefundablePurchases;
            const isDisabled =
              shopPendingQuantity !== null ||
              upgradeState.isOwned ||
              upgradeState.cost === null ||
              cannotAfford ||
              refundUnavailable;
            const isPurchasable = !isDisabled && !upgradeState.isPending;
            return (
              <div key={upgrade.id} className={`shop-upgrade-row${upgradeState.isOwned ? " shop-upgrade-row-owned" : ""}`}>
                <div className="shop-upgrade-main">
                  <GameIcon icon={getLucidIcon(upgrade.icon)} className="shop-upgrade-icon" />
                  <div className="shop-upgrade-copy">
                    <p className="shop-upgrade-name">
                      {upgrade.name}
                      {currentLevel !== null ? ` (Lvl ${currentLevel})` : ""}
                    </p>
                    <p className="shop-upgrade-description">{upgradeState.description}</p>
                    {upgradeState.currentValueDescription ? (
                      <p className="shop-upgrade-description subtle">Current: {upgradeState.currentValueDescription}</p>
                    ) : null}
                    {upgradeState.nextValueDescription ? (
                      <p className="shop-upgrade-description subtle">Next: {upgradeState.nextValueDescription}</p>
                    ) : null}
                  </div>
                </div>
                <div className="shop-upgrade-action">
                  <button
                    type="button"
                    className={`secondary shop-upgrade-buy-button${isPurchasable ? " shop-upgrade-buy-button-purchasable" : ""}`}
                    onClick={() => void upgradeState.onPurchase()}
                    disabled={isDisabled}
                  >
                    {upgradeState.isOwned ? (
                      "Owned"
                    ) : upgradeState.isPending ? (
                      "..."
                    ) : upgradeState.cost === null ? (
                      "Max level"
                    ) : (
                      <>
                        <Plus size={18} aria-hidden="true" className="shop-upgrade-buy-plus" />
                        <span className="shop-upgrade-buy-cost">
                          {formatUpgradeCost(upgrade.currencyType, upgradeState.cost)}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
