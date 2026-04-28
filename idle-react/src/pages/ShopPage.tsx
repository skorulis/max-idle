import { formatSeconds } from "../formatSeconds";
import {
  Archive,
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
  Trophy,
  Undo2,
  type LucideIcon
} from "lucide-react";
import { useState } from "react";
import type { SyncedPlayerState } from "../app/types";
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
import { getSecondsMultiplierLevel, hasRefundableShopPurchases } from "../shop";
import GameIcon from "../GameIcon";

type ShopPageProps = {
  playerState: SyncedPlayerState | null;
  shopPendingQuantity:
    | "seconds_multiplier"
    | "restraint"
    | "idle_hoarder"
    | "worthwhile_achievements"
    | "luck"
    | "extra_realtime_wait"
    | "collect_gem_time_boost"
    | "purchase_refund"
    | "debug_add_gems"
    | null;
  secondsMultiplierCost: number | null;
  /** Purchase flow for any shop upgrade row; `upgradeId` matches {@link SHOP_UPGRADE_IDS}. */
  onPurchase: (upgradeId: ShopUpgradeId) => Promise<void>;
  restraintLevel: number;
  restraintMaxLevel: number;
  luckLevel: number;
  luckMaxLevel: number;
  idleHoarderLevel: number;
  idleHoarderMaxLevel: number;
  worthwhileAchievementsLevel: number;
  worthwhileAchievementsMaxLevel: number;
  showDebugAddGemsButton: boolean;
  onDebugAddGems: () => Promise<void>;
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

function formatUpgradeValue(upgrade: ShopUpgradeDefinition, value: number): string {
  if (upgrade.id === SHOP_UPGRADE_IDS.LUCK) {
    return formatChance(value);
  }
  if (
    upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER ||
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

function getUpgradeBaseValue(upgrade: ShopUpgradeDefinition): number | null {
  if (upgrade.id === SHOP_UPGRADE_IDS.LUCK) {
    return 0;
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST) {
    return 0;
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER || upgrade.id === SHOP_UPGRADE_IDS.RESTRAINT) {
    return 1;
  }
  return null;
}

function formatValueDescription(upgrade: ShopUpgradeDefinition, value: number): string {
  const valueDescription = (upgrade as ShopUpgradeDefinition & { valueDescription?: string | null }).valueDescription;
  if (!valueDescription) {
    return "";
  }
  return valueDescription.replace("%s", formatUpgradeValue(upgrade, value));
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
    case "archive":
      return Archive;
    case "timer":
      return Timer;
    case "undo-2":
      return Undo2;
    case "trophy":
      return Trophy;
    default:
      return CircleHelp;
  }
}

export function ShopPage({
  playerState,
  shopPendingQuantity,
  secondsMultiplierCost,
  onPurchase,
  restraintLevel,
  restraintMaxLevel,
  luckLevel,
  luckMaxLevel,
  idleHoarderLevel,
  idleHoarderMaxLevel,
  worthwhileAchievementsLevel,
  worthwhileAchievementsMaxLevel,
  showDebugAddGemsButton,
  onDebugAddGems,
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
  const maxSecondsMultiplierLevel = SECONDS_MULTIPLIER_SHOP_UPGRADE.maxLevel();
  const maxCollectGemBoostLevel = getCollectGemTimeBoostMaxLevel();
  const hasRefundablePurchases = hasRefundableShopPurchases(playerState.shop);

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
    const valueDescription = (upgrade as ShopUpgradeDefinition & { valueDescription?: string | null }).valueDescription;
    const hasValueDescription = typeof valueDescription === "string" && valueDescription.length > 0;
    const currentLevelValue =
      purchasedLevel > 0 ? (upgrade.levels[purchasedLevel - 1]?.value ?? null) : getUpgradeBaseValue(upgrade);
    const nextLevelValue = upgrade.levels[purchasedLevel]?.value ?? null;
    const currentValueDescription =
      hasValueDescription && currentLevelValue !== null ? formatValueDescription(upgrade, currentLevelValue) : null;
    const nextValueDescription =
      hasValueDescription && nextLevelValue !== null ? formatValueDescription(upgrade, nextLevelValue) : null;

    if (upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER) {
      return {
        description: upgrade.description,
        currentValueDescription,
        nextValueDescription,
        cost: secondsMultiplierCost,
        isPending: shopPendingQuantity === upgrade.id,
        isOwned: secondsMultiplierLevel >= maxSecondsMultiplierLevel,
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

    const isRestraint = upgrade.id === SHOP_UPGRADE_IDS.RESTRAINT;
    const isIdleHoarder = upgrade.id === SHOP_UPGRADE_IDS.IDLE_HOARDER;
    const isLuck = upgrade.id === SHOP_UPGRADE_IDS.LUCK;
    const isWorthwhileAchievements = upgrade.id === SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS;
    const currentLevel = isRestraint
      ? restraintLevel
      : isIdleHoarder
        ? idleHoarderLevel
        : isLuck
          ? luckLevel
          : isWorthwhileAchievements
            ? worthwhileAchievementsLevel
            : 0;
    const maxLevel = isRestraint
      ? restraintMaxLevel
      : isIdleHoarder
        ? idleHoarderMaxLevel
        : isLuck
          ? luckMaxLevel
          : isWorthwhileAchievements
            ? worthwhileAchievementsMaxLevel
            : 0;
    const isOwned =
      isRestraint || isIdleHoarder || isLuck || isWorthwhileAchievements ? currentLevel >= maxLevel : false;
    const isPending = shopPendingQuantity === upgrade.id;
    const nextLevel = upgrade.levels[currentLevel] ?? null;
    return {
      description:
        isOwned
            ? "Maximum level reached."
            : upgrade.description,
      currentValueDescription,
      nextValueDescription,
      cost:
        isRestraint || isIdleHoarder || isLuck || isWorthwhileAchievements
          ? nextLevel?.cost ?? null
          : upgrade.levels[0]?.cost ?? null,
      isPending,
      isOwned,
      onPurchase: () => onPurchase(upgrade.id)
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
    if (upgrade.id === SHOP_UPGRADE_IDS.IDLE_HOARDER) {
      return idleHoarderLevel;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS) {
      return worthwhileAchievementsLevel;
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
      {showDebugAddGemsButton && selectedCurrencyType === SHOP_CURRENCY_TYPES.GEM ? (
        <button
          type="button"
          className="secondary"
          onClick={() => void onDebugAddGems()}
          disabled={shopPendingQuantity !== null}
        >
          {shopPendingQuantity === "debug_add_gems" ? "Adding gems..." : "Debug: Add 5 Time Gems"}
        </button>
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
