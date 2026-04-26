import { formatSeconds } from "../formatSeconds";
import {
  Atom,
  CircleHelp,
  Clock3,
  Dice5,
  Gauge,
  Gem,
  Hourglass,
  Plus,
  ShieldAlert,
  Timer,
  Undo2,
  type LucideIcon
} from "lucide-react";
import { useState } from "react";
import type { SyncedPlayerState } from "../app/types";
import {
  formatShopUpgradeDescription,
  getCollectGemTimeBoostMaxLevel,
  getCollectGemTimeBoostUpgradeCostAtLevel,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS,
  SHOP_UPGRADES,
  type ShopUpgradeDefinition
} from "../shopUpgrades";
import type { ShopCurrencyType } from "../shopUpgrades";
import { getSecondsMultiplierLevel, getSecondsMultiplierMaxLevel, hasRefundableShopPurchases } from "../shop";
import GameIcon from "../GameIcon";

type ShopPageProps = {
  playerState: SyncedPlayerState | null;
  shopPendingQuantity:
    | "seconds_multiplier"
    | "restraint"
    | "luck"
    | "extra_realtime_wait"
    | "collect_gem_time_boost"
    | "purchase_refund"
    | null;
  secondsMultiplierCost: number | null;
  onPurchaseUpgrade: () => Promise<void>;
  restraintLevel: number;
  restraintMaxLevel: number;
  onPurchaseRestraint: () => Promise<void>;
  luckLevel: number;
  luckMaxLevel: number;
  onPurchaseLuck: () => Promise<void>;
  onPurchaseExtraRealtimeWait: () => Promise<void>;
  onPurchaseCollectGemTimeBoost: () => Promise<void>;
  onPurchaseRefund: () => Promise<void>;
  collectGemBoostLevel: number;
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

function getShopUpgradeIcon(iconName: string): LucideIcon {
  switch (iconName) {
    case "gauge":
      return Gauge;
    case "shield-alert":
      return ShieldAlert;
    case "dice-5":
      return Dice5;
    case "hourglass":
      return Hourglass;
    case "timer":
      return Timer;
    case "undo-2":
      return Undo2;
    default:
      return CircleHelp;
  }
}

export function ShopPage({
  playerState,
  shopPendingQuantity,
  secondsMultiplierCost,
  onPurchaseUpgrade,
  restraintLevel,
  restraintMaxLevel,
  onPurchaseRestraint,
  luckLevel,
  luckMaxLevel,
  onPurchaseLuck,
  onPurchaseExtraRealtimeWait,
  onPurchaseCollectGemTimeBoost,
  onPurchaseRefund,
  collectGemBoostLevel,
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

  const visibleUpgrades = SHOP_UPGRADES.filter((upgrade) => upgrade.currencyType === selectedCurrencyType);
  const secondsMultiplierLevel = getSecondsMultiplierLevel(playerState.shop);
  const maxSecondsMultiplierLevel = getSecondsMultiplierMaxLevel();
  const maxCollectGemBoostLevel = getCollectGemTimeBoostMaxLevel();
  const hasRefundablePurchases = hasRefundableShopPurchases(playerState.shop);

  function getUpgradeRowState(upgrade: ShopUpgradeDefinition): {
    description: string;
    cost: number | null;
    isPending: boolean;
    isOwned: boolean;
    onPurchase: () => Promise<void>;
  } {
    if (upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER) {
      const nextLevel = upgrade.levels[secondsMultiplierLevel] ?? null;
      return {
        description: nextLevel
          ? formatShopUpgradeDescription(upgrade, formatMultiplier(nextLevel.value))
          : "Maximum level reached.",
        cost: secondsMultiplierCost,
        isPending: shopPendingQuantity === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER,
        isOwned: secondsMultiplierLevel >= maxSecondsMultiplierLevel,
        onPurchase: onPurchaseUpgrade
      };
    }

    if (upgrade.id === SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT) {
      const level = upgrade.levels[0] ?? null;
      return {
        description: level
          ? formatShopUpgradeDescription(upgrade, formatSeconds(level.value, 2, "floor"))
          : upgrade.description,
        cost: level?.cost ?? null,
        isPending: shopPendingQuantity === "extra_realtime_wait",
        isOwned: false,
        onPurchase: onPurchaseExtraRealtimeWait
      };
    }

    if (upgrade.id === SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST) {
      const nextLevelDef = upgrade.levels[collectGemBoostLevel] ?? null;
      const nextValueStr = nextLevelDef ? formatMultiplier(nextLevelDef.value) : "";
      return {
        description: nextLevelDef
          ? formatShopUpgradeDescription(upgrade, nextValueStr)
          : "Maximum level reached.",
        cost: getCollectGemTimeBoostUpgradeCostAtLevel(collectGemBoostLevel) || null,
        isPending: shopPendingQuantity === "collect_gem_time_boost",
        isOwned: collectGemBoostLevel >= maxCollectGemBoostLevel,
        onPurchase: onPurchaseCollectGemTimeBoost
      };
    }

    if (upgrade.id === SHOP_UPGRADE_IDS.PURCHASE_REFUND) {
      return {
        description: upgrade.description,
        cost: upgrade.levels[0]?.cost ?? null,
        isPending: shopPendingQuantity === SHOP_UPGRADE_IDS.PURCHASE_REFUND,
        isOwned: false,
        onPurchase: onPurchaseRefund
      };
    }

    const isRestraint = upgrade.id === SHOP_UPGRADE_IDS.RESTRAINT;
    const isLuck = upgrade.id === SHOP_UPGRADE_IDS.LUCK;
    const currentLevel = isRestraint ? restraintLevel : isLuck ? luckLevel : 0;
    const maxLevel = isRestraint ? restraintMaxLevel : isLuck ? luckMaxLevel : 0;
    const isOwned = isRestraint || isLuck ? currentLevel >= maxLevel : false;
    const isPending = isRestraint ? shopPendingQuantity === "restraint" : shopPendingQuantity === "luck";
    const onPurchase = isRestraint ? onPurchaseRestraint : onPurchaseLuck;
    const nextLevel = upgrade.levels[currentLevel] ?? null;
    const nextValue = isRestraint ? formatMultiplier(nextLevel?.value ?? 0) : formatChance(nextLevel?.value ?? 0);
    return {
      description:
        (isRestraint || isLuck) && nextLevel
          ? formatShopUpgradeDescription(upgrade, nextValue)
          : upgrade.description,
      cost: isRestraint || isLuck ? nextLevel?.cost ?? null : upgrade.levels[0]?.cost ?? null,
      isPending,
      isOwned,
      onPurchase
    };
  }

  function getUpgradeCurrentLevel(upgrade: ShopUpgradeDefinition): number | null {
    if (upgrade.levels.length <= 1) {
      return null;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER) {
      return secondsMultiplierLevel;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.RESTRAINT) {
      return restraintLevel;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.LUCK) {
      return luckLevel;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST) {
      return collectGemBoostLevel;
    }
    const maybeLevel = playerState?.shop[upgrade.id];
    if (typeof maybeLevel === "number" && Number.isFinite(maybeLevel) && maybeLevel >= 0) {
      return Math.floor(maybeLevel);
    }
    return 0;
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
          <p className="shop-currency-value">{formatSeconds(playerState.idleTime.available, 2, "floor")}</p>
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
          <p className="shop-currency-value">{formatSeconds(playerState.realTime.available, 2, "floor")}</p>
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
          <p className="shop-currency-value">{playerState.timeGems.available}</p>
        </button>
      </div>
      {selectedCurrencyType === SHOP_CURRENCY_TYPES.IDLE ? (
        <p className="subtle">Current multiplier: {playerState.secondsMultiplier.toFixed(1)}x</p>
      ) : null}
      {visibleUpgrades.length === 0 ? (
        <p className="subtle">No upgrades currently available for this currency.</p>
      ) : (
        <div className="shop-upgrade-list">
          {visibleUpgrades.map((upgrade) => {
            const upgradeState = getUpgradeRowState(upgrade);
            const currentLevel = getUpgradeCurrentLevel(upgrade);
            const upgradeAvailableBalance = getCurrencyAmount(playerState, upgrade.currencyType);
            const cannotAfford = upgradeState.cost !== null && upgradeAvailableBalance < upgradeState.cost;
            const refundUnavailable =
              upgrade.id === SHOP_UPGRADE_IDS.PURCHASE_REFUND && !hasRefundablePurchases;
            const isDisabled =
              shopPendingQuantity !== null ||
              upgradeState.isOwned ||
              upgradeState.cost === null ||
              cannotAfford ||
              refundUnavailable;
            return (
              <div key={upgrade.id} className={`shop-upgrade-row${upgradeState.isOwned ? " shop-upgrade-row-owned" : ""}`}>
                <div className="shop-upgrade-main">
                  <GameIcon icon={getShopUpgradeIcon(upgrade.icon)} className="shop-upgrade-icon" />
                  <div className="shop-upgrade-copy">
                    <p className="shop-upgrade-name">
                      {upgrade.name}
                      {currentLevel !== null ? ` (Lv ${currentLevel})` : ""}
                    </p>
                    <p className="shop-upgrade-description">{upgradeState.description}</p>
                  </div>
                </div>
                <div className="shop-upgrade-action">
                  <button
                    type="button"
                    className="secondary shop-upgrade-buy-button"
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
                        <Plus size={22} aria-hidden="true" className="shop-upgrade-buy-plus" />
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
