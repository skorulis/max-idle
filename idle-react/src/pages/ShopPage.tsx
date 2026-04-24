import { formatSeconds } from "../formatSeconds";
import { Atom, Clock3, Gem } from "lucide-react";
import type { SyncedPlayerState } from "../app/types";

type ShopPageProps = {
  playerState: SyncedPlayerState | null;
  shopPendingQuantity: 1 | 5 | 10 | "restraint" | "luck" | null;
  shopCosts: Record<1 | 5 | 10, number>;
  onPurchaseUpgrade: (quantity: 1 | 5 | 10) => Promise<void>;
  restraintUpgradeCost: number;
  hasRestraintUpgrade: boolean;
  onPurchaseRestraint: () => Promise<void>;
  luckUpgradeCost: number;
  hasLuckUpgrade: boolean;
  onPurchaseLuck: () => Promise<void>;
  onNavigateHome: () => void;
};

export function ShopPage({
  playerState,
  shopPendingQuantity,
  shopCosts,
  onPurchaseUpgrade,
  restraintUpgradeCost,
  hasRestraintUpgrade,
  onPurchaseRestraint,
  luckUpgradeCost,
  hasLuckUpgrade,
  onPurchaseLuck,
  onNavigateHome
}: ShopPageProps) {
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

  return (
    <>
      <h2>Shop</h2>
      <div className="shop-currencies">
        <div className="shop-currency-card">
          <p className="shop-currency-title">
            <Atom size={16} aria-hidden="true" />
            Idle Time
          </p>
          <p className="shop-currency-value">{formatSeconds(playerState.idleTime.available, 2, "floor")}</p>
        </div>
        <div className="shop-currency-card">
          <p className="shop-currency-title">
            <Clock3 size={16} aria-hidden="true" />
            Real Time
          </p>
          <p className="shop-currency-value">{formatSeconds(playerState.realTime.available, 2, "floor")}</p>
        </div>
        <div className="shop-currency-card">
          <p className="shop-currency-title">
            <Gem size={16} aria-hidden="true" />
            Time Gems
          </p>
          <p className="shop-currency-value">{playerState.timeGems.available}</p>
        </div>
      </div>
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
      <p className="subtle">Upgrade: Restraint (+50% idle gain, cannot collect under 1 hour realtime)</p>
      <div className="shop-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => void onPurchaseRestraint()}
          disabled={
            shopPendingQuantity !== null || hasRestraintUpgrade || playerState.idleTime.available < restraintUpgradeCost
          }
        >
          {hasRestraintUpgrade
            ? "Restraint owned"
            : shopPendingQuantity === "restraint"
              ? "Purchasing..."
              : `Buy Restraint (${formatSeconds(restraintUpgradeCost)})`}
        </button>
      </div>
      <p className="subtle">Upgrade: Luck (50% chance to keep timer on collect)</p>
      <div className="shop-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => void onPurchaseLuck()}
          disabled={shopPendingQuantity !== null || hasLuckUpgrade || playerState.idleTime.available < luckUpgradeCost}
        >
          {hasLuckUpgrade
            ? "Luck owned"
            : shopPendingQuantity === "luck"
              ? "Purchasing..."
              : `Buy Luck (${formatSeconds(luckUpgradeCost)})`}
        </button>
      </div>
    </>
  );
}
