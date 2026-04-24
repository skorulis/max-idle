import { useEffect, useMemo } from "react";
import { CircleX } from "lucide-react";
import type { ShopState } from "../shop";
import { getRestraintBonusMultiplier, getSecondsMultiplier } from "../shop";
import { getIdleSecondsRate } from "../idleRate";

type CurrentRateInfoOverlayProps = {
  open: boolean;
  onClose: () => void;
  secondsSinceLastCollection: number;
  effectiveIdleSecondsRate: number;
  shop: ShopState;
  achievementBonusMultiplier: number;
};

export function CurrentRateInfoOverlay({
  open,
  onClose,
  secondsSinceLastCollection,
  effectiveIdleSecondsRate,
  shop,
  achievementBonusMultiplier
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
    const baseRate = getIdleSecondsRate({
      secondsSinceLastCollection: Math.max(0, secondsSinceLastCollection)
    });
    const secondsMultiplier = getSecondsMultiplier(shop);
    const shopBonusMultiplier = getRestraintBonusMultiplier(shop);
    const safeAchievementBonusMultiplier = Number.isFinite(achievementBonusMultiplier) ? achievementBonusMultiplier : 1;

    return {
      baseRate,
      secondsMultiplier,
      shopBonusMultiplier,
      safeAchievementBonusMultiplier,
      calculatedRate: baseRate * secondsMultiplier * shopBonusMultiplier * safeAchievementBonusMultiplier
    };
  }, [achievementBonusMultiplier, secondsSinceLastCollection, shop]);

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
          <span>{factors.baseRate.toFixed(2)}x</span>
        </p>
        {shouldShowFactor(factors.secondsMultiplier) ? (
          <p className="rate-factor-row">
            <span>Seconds multiplier upgrade</span>
            <span>{factors.secondsMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        {shouldShowFactor(factors.shopBonusMultiplier) ? (
          <p className="rate-factor-row">
            <span>Restraint multiplier</span>
            <span>{factors.shopBonusMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        {shouldShowFactor(factors.safeAchievementBonusMultiplier) ? (
          <p className="rate-factor-row">
            <span>Achievements bonus</span>
            <span>{factors.safeAchievementBonusMultiplier.toFixed(2)}x</span>
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
