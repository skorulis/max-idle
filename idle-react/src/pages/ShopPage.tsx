import { formatSeconds } from "../formatSeconds";
import { Atom, Clock3, Gem } from "lucide-react";
import { useState } from "react";
import type { SyncedPlayerState } from "../app/types";
import {
  formatShopUpgradeDescription,
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS,
  SHOP_UPGRADES
} from "../shopUpgrades";
import type { ShopCurrencyType, ShopUpgradeId } from "../shopUpgrades";
import { getSecondsMultiplierLevel } from "../shop";

type ShopPageProps = {
  playerState: SyncedPlayerState | null;
  shopPendingQuantity: 1 | 5 | 10 | "restraint" | "luck" | null;
  shopCosts: Record<1 | 5 | 10, number | null>;
  onPurchaseUpgrade: (quantity: 1 | 5 | 10) => Promise<void>;
  hasRestraintUpgrade: boolean;
  onPurchaseRestraint: () => Promise<void>;
  hasLuckUpgrade: boolean;
  onPurchaseLuck: () => Promise<void>;
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

export function ShopPage({
  playerState,
  shopPendingQuantity,
  shopCosts,
  onPurchaseUpgrade,
  hasRestraintUpgrade,
  onPurchaseRestraint,
  hasLuckUpgrade,
  onPurchaseLuck,
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

  const visibleUpgrades = SHOP_UPGRADES.filter(
    (upgrade) =>
      upgrade.currencyType === selectedCurrencyType && upgrade.id !== SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER
  );
  const secondsMultiplierLevel = getSecondsMultiplierLevel(playerState.shop);
  const nextSecondsMultiplierLevel = SECONDS_MULTIPLIER_SHOP_UPGRADE.levels[secondsMultiplierLevel] ?? null;
  const secondsMultiplierDescription = nextSecondsMultiplierLevel
    ? formatShopUpgradeDescription(SECONDS_MULTIPLIER_SHOP_UPGRADE, formatMultiplier(nextSecondsMultiplierLevel.value))
    : "Maximum level reached.";
  const sharedUpgradeStateById: Record<
    Exclude<ShopUpgradeId, "seconds_multiplier">,
    {
      hasUpgrade: boolean;
      isPending: boolean;
      onPurchase: () => Promise<void>;
    }
  > = {
    [SHOP_UPGRADE_IDS.RESTRAINT]: {
      hasUpgrade: hasRestraintUpgrade,
      isPending: shopPendingQuantity === SHOP_UPGRADE_IDS.RESTRAINT,
      onPurchase: onPurchaseRestraint
    },
    [SHOP_UPGRADE_IDS.LUCK]: {
      hasUpgrade: hasLuckUpgrade,
      isPending: shopPendingQuantity === SHOP_UPGRADE_IDS.LUCK,
      onPurchase: onPurchaseLuck
    }
  };

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
        <>
          <p className="subtle">Upgrade: {SECONDS_MULTIPLIER_SHOP_UPGRADE.name} ({secondsMultiplierDescription})</p>
          <p className="subtle">Current level: {secondsMultiplierLevel}</p>
          <p className="subtle">Current multiplier: {playerState.secondsMultiplier.toFixed(1)}x</p>
          <div className="shop-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => void onPurchaseUpgrade(1)}
              disabled={
                shopPendingQuantity !== null || shopCosts[1] === null || playerState.idleTime.available < (shopCosts[1] ?? 0)
              }
            >
              {shopPendingQuantity === 1
                ? "Purchasing..."
                : shopCosts[1] === null
                  ? "Buy x1 (max level)"
                  : `Buy x1 (${formatSeconds(shopCosts[1])})`}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void onPurchaseUpgrade(5)}
              disabled={
                shopPendingQuantity !== null || shopCosts[5] === null || playerState.idleTime.available < (shopCosts[5] ?? 0)
              }
            >
              {shopPendingQuantity === 5
                ? "Purchasing..."
                : shopCosts[5] === null
                  ? "Buy x5 (max level)"
                  : `Buy x5 (${formatSeconds(shopCosts[5])})`}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void onPurchaseUpgrade(10)}
              disabled={
                shopPendingQuantity !== null ||
                shopCosts[10] === null ||
                playerState.idleTime.available < (shopCosts[10] ?? 0)
              }
            >
              {shopPendingQuantity === 10
                ? "Purchasing..."
                : shopCosts[10] === null
                  ? "Buy x10 (max level)"
                  : `Buy x10 (${formatSeconds(shopCosts[10])})`}
            </button>
          </div>
        </>
      ) : null}
      {visibleUpgrades.length === 0 ? (
        <p className="subtle">No upgrades currently available for this currency.</p>
      ) : (
        visibleUpgrades.map((upgrade) => {
          if (upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER) {
            return null;
          }
          const upgradeState = sharedUpgradeStateById[upgrade.id];
          const upgradeAvailableBalance = getCurrencyAmount(playerState, upgrade.currencyType);
          return (
            <div key={upgrade.id}>
              <p className="subtle">
                Upgrade: {upgrade.name} ({upgrade.description})
              </p>
              <div className="shop-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void upgradeState.onPurchase()}
                  disabled={
                    shopPendingQuantity !== null ||
                    upgradeState.hasUpgrade ||
                    upgradeAvailableBalance < (upgrade.levels[0]?.cost ?? 0)
                  }
                >
                  {upgradeState.hasUpgrade
                    ? `${upgrade.name} owned`
                    : upgradeState.isPending
                      ? "Purchasing..."
                      : `Buy ${upgrade.name} (${formatUpgradeCost(upgrade.currencyType, upgrade.levels[0]?.cost ?? 0)})`}
                </button>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
