import { useEffect, useMemo } from "react";
import { CircleX } from "lucide-react";
import type { ShopState } from "../shop";
import {
  getAntiConsumeristMultiplier,
  getRestraintBonusMultiplier,
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier
} from "../shop";
import { getPatienceRate } from "../idleRate";
import { ANTI_CONSUMERIST_SHOP_UPGRADE, getCollectGemIdleSecondsMultiplier, getIdleHoarderMultiplier, IDLE_HOARDER_SHOP_UPGRADE } from "../shopUpgrades";
import { safeNumber } from "@maxidle/shared/safeNumber";

type CurrentRateInfoOverlayProps = {
  open: boolean;
  onClose: () => void;
  secondsSinceLastCollection: number;
  effectiveIdleSecondsRate: number;
  shop: ShopState;
  achievementCount: number;
  realTimeAvailable: number;
  estimatedServerNowMs: number;
};

export function CurrentRateInfoOverlay({
  open,
  onClose,
  secondsSinceLastCollection,
  effectiveIdleSecondsRate,
  shop,
  achievementCount,
  realTimeAvailable,
  estimatedServerNowMs
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
    const patienceRate = getPatienceRate({
      secondsSinceLastCollection: Math.max(0, secondsSinceLastCollection),
      shop,
      achievementCount,
      realTimeAvailable
    });
    const secondsMultiplier = getSecondsMultiplier(shop);
    const gemBonus = getCollectGemIdleSecondsMultiplier(shop)
    const shopBonusMultiplier = getRestraintBonusMultiplier(shop);
    const antiConsumeristLevel = ANTI_CONSUMERIST_SHOP_UPGRADE.currentLevel(shop);
    const antiConsumeristMultiplier =
      antiConsumeristLevel > 0 ? getAntiConsumeristMultiplier(shop, estimatedServerNowMs) : 1;
    const worthwhileAchievementsMultiplier = getWorthwhileAchievementsMultiplier(
      shop,
      safeNumber(achievementCount, 0)
    );
    const rateBeforeIdleHoarder =
      patienceRate *
      secondsMultiplier *
      shopBonusMultiplier *
      antiConsumeristMultiplier *
      gemBonus *
      worthwhileAchievementsMultiplier;
    const idleHoarderLevel = IDLE_HOARDER_SHOP_UPGRADE.currentLevel(shop);
    const idleHoarderMultiplier = getIdleHoarderMultiplier(
      idleHoarderLevel,
      realTimeAvailable,
      Math.max(0, secondsSinceLastCollection)
    );

    return {
      patienceRate,
      secondsMultiplier,
      shopBonusMultiplier,
      antiConsumeristLevel,
      antiConsumeristMultiplier,
      worthwhileAchievementsMultiplier,
      idleHoarderLevel,
      idleHoarderMultiplier,
      gemBonus,
      calculatedRate: rateBeforeIdleHoarder * idleHoarderMultiplier,
    };
  }, [achievementCount, estimatedServerNowMs, realTimeAvailable, secondsSinceLastCollection, shop]);

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
        {factors.antiConsumeristLevel > 0 ? (
          <p className="rate-factor-row">
            <span>Anti-consumerist multiplier</span>
            <span>{factors.antiConsumeristMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        {shouldShowFactor(factors.worthwhileAchievementsMultiplier) ? (
          <p className="rate-factor-row">
            <span>Achivement multiplier</span>
            <span>{factors.worthwhileAchievementsMultiplier.toFixed(2)}x</span>
          </p>
        ) : null}
        {shouldShowFactor(factors.gemBonus) ? (
          <p className="rate-factor-row">
            <span>Time Gem Bonus</span>
            <span>{factors.gemBonus.toFixed(2)}x</span>
          </p>
        ) : null}
        {factors.idleHoarderLevel > 0 ? (
          <p className="rate-factor-row">
            <span>Real hoarder multiplier</span>
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
