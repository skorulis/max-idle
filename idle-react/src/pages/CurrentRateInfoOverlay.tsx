import { useEffect, useMemo } from "react";
import { CircleX } from "lucide-react";
import type { ShopState } from "../shop";
import { getRestraintBonusMultiplier, getSecondsMultiplier, getWorthwhileAchievementsMultiplier } from "../shop";
import { getIdleSecondsRate } from "../idleRate";
import { getIdleHoarderMultiplier, IDLE_HOARDER_SHOP_UPGRADE } from "../shopUpgrades";
import { safeNumber } from "@maxidle/shared/safeNumber";

type CurrentRateInfoOverlayProps = {
  open: boolean;
  onClose: () => void;
  secondsSinceLastCollection: number;
  effectiveIdleSecondsRate: number;
  shop: ShopState;
  achievementCount: number;
  realTimeAvailable: number;
};

export function CurrentRateInfoOverlay({
  open,
  onClose,
  secondsSinceLastCollection,
  effectiveIdleSecondsRate,
  shop,
  achievementCount,
  realTimeAvailable
}: CurrentRateInfoOverlayProps) {
  const shouldShowFactor = (value: number): boolean => Math.abs(value - 1) > Number.EPSILON;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  const factors = useMemo(() => {
    const patienceRate = getIdleSecondsRate({
      secondsSinceLastCollection: Math.max(0, secondsSinceLastCollection),
      shop
    });
    const secondsMultiplier = getSecondsMultiplier(shop);
    const shopBonusMultiplier = getRestraintBonusMultiplier(shop);
    const worthwhileAchievementsMultiplier = getWorthwhileAchievementsMultiplier(
      shop,
      safeNumber(achievementCount, 0)
    );
    const rateBeforeIdleHoarder = patienceRate * secondsMultiplier * shopBonusMultiplier * worthwhileAchievementsMultiplier;
    const idleHoarderMultiplier = getIdleHoarderMultiplier(
      IDLE_HOARDER_SHOP_UPGRADE.currentLevel(shop),
      realTimeAvailable,
      Math.max(0, secondsSinceLastCollection)
    );

    return {
      patienceRate,
      secondsMultiplier,
      shopBonusMultiplier,
      worthwhileAchievementsMultiplier,
      idleHoarderMultiplier,
      calculatedRate: rateBeforeIdleHoarder * idleHoarderMultiplier
    };
  }, [achievementCount, realTimeAvailable, secondsSinceLastCollection, shop]);

  if (!open) {
    return null;
  }

  return (
    <div className="rate-info-overlay" role="presentation" onClick={onClose}>
      <div
        className="rate-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="current-rate-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rate-info-header">
          <h3 id="current-rate-info-title">Current rate factors</h3>
          <button type="button" className="info-icon-button" onClick={onClose} aria-label="Close rate details">
            <CircleX size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="subtle">Your current rate is multiplied from these values:</p>
        <p className="rate-factor-row">
          <span>Patience bonus</span>
          <span>{factors.patienceRate.toFixed(2)}x</span>
        </p>
        {shouldShowFactor(factors.secondsMultiplier) ? (
          <p className="rate-factor-row">
            <span>Basic multiplier</span>
            <span>{factors.secondsMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        {shouldShowFactor(factors.shopBonusMultiplier) ? (
          <p className="rate-factor-row">
            <span>Restraint multiplier</span>
            <span>{factors.shopBonusMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        {shouldShowFactor(factors.worthwhileAchievementsMultiplier) ? (
          <p className="rate-factor-row">
            <span>Achivement multiplier</span>
            <span>{factors.worthwhileAchievementsMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        {shouldShowFactor(factors.idleHoarderMultiplier) ? (
          <p className="rate-factor-row">
            <span>Idle hoarder multiplier</span>
            <span>{factors.idleHoarderMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        <p className="rate-factor-total">
          <span>Total effective rate</span>
          <span>{effectiveIdleSecondsRate.toFixed(2)}x</span>
        </p>
        <p className="subtle">Calculated total: {factors.calculatedRate.toFixed(2)}x</p>
      </div>
    </div>
  );
}
