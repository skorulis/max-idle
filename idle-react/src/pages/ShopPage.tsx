import { formatSeconds } from "../formatSeconds";
import { Atom, Clock3, Gem } from "lucide-react";
import { useState } from "react";
import type { SyncedPlayerState } from "../app/types";
import { SHOP_CURRENCY_TYPES, SHOP_UPGRADE_IDS, SHOP_UPGRADES } from "../shopUpgrades";
import type { ShopCurrencyType, ShopUpgradeId } from "../shopUpgrades";

type ShopPageProps = {
  playerState: SyncedPlayerState | null;
  shopPendingQuantity: 1 | 5 | 10 | "restraint" | "luck" | null;
  shopCosts: Record<1 | 5 | 10, number>;
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

  const visibleUpgrades = SHOP_UPGRADES.filter((upgrade) => upgrade.currencyType === selectedCurrencyType);
  const sharedUpgradeStateById: Record<
    ShopUpgradeId,
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
          <p className="subtle">Upgrade: seconds multiplier (+0.1x per purchase)</p>
          <p className="subtle">Current multiplier: {playerState.secondsMultiplier.toFixed(1)}x</p>
          <div className="shop-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => void onPurchaseUpgrade(1)}
              disabled={shopPendingQuantity !== null || playerState.idleTime.available < shopCosts[1]}
            >
              {shopPendingQuantity === 1 ? "Purchasing..." : `Buy x1 (${formatSeconds(shopCosts[1])})`}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void onPurchaseUpgrade(5)}
              disabled={shopPendingQuantity !== null || playerState.idleTime.available < shopCosts[5]}
            >
              {shopPendingQuantity === 5 ? "Purchasing..." : `Buy x5 (${formatSeconds(shopCosts[5])})`}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void onPurchaseUpgrade(10)}
              disabled={shopPendingQuantity !== null || playerState.idleTime.available < shopCosts[10]}
            >
              {shopPendingQuantity === 10 ? "Purchasing..." : `Buy x10 (${formatSeconds(shopCosts[10])})`}
            </button>
          </div>
        </>
      ) : null}
      {visibleUpgrades.length === 0 ? (
        <p className="subtle">No upgrades currently available for this currency.</p>
      ) : (
        visibleUpgrades.map((upgrade) => {
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
                    shopPendingQuantity !== null || upgradeState.hasUpgrade || upgradeAvailableBalance < upgrade.cost
                  }
                >
                  {upgradeState.hasUpgrade
                    ? `${upgrade.name} owned`
                    : upgradeState.isPending
                      ? "Purchasing..."
                      : `Buy ${upgrade.name} (${formatUpgradeCost(upgrade.currencyType, upgrade.cost)})`}
                </button>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
