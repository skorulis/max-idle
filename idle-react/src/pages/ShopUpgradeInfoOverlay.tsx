import { useEffect } from "react";
import { CircleX } from "lucide-react";
import { formatSeconds } from "../formatSeconds";
import type { ShopState } from "../shop";
import { countIdleShopUpgradeTypesForConsolidation, SHOP_UPGRADE_IDS } from "../shopUpgrades";
import type { ShopUpgradeDefinition } from "../shopUpgrades";

type ShopUpgradeInfoOverlayProps = {
  open: boolean;
  upgrade: ShopUpgradeDefinition | null;
  onClose: () => void;
  /** Present while authenticated on the shop; used for upgrade-specific context lines */
  shop?: ShopState | null;
  /** Estimated server clock (ms); pairs with `shop` for streak-style upgrades */
  estimatedServerNowMs?: number;
};

function UpgradeExtraInfo({
  upgrade,
  shop,
  estimatedServerNowMs
}: {
  upgrade: ShopUpgradeDefinition;
  shop: ShopState | null | undefined;
  estimatedServerNowMs: number | undefined;
}) {
  if (upgrade.id === SHOP_UPGRADE_IDS.ANTI_CONSUMERIST) {
    const serverNowMs = estimatedServerNowMs;
    if (!shop || typeof serverNowMs !== "number" || !Number.isFinite(serverNowMs) || serverNowMs <= 0) {
      return null;
    }
    const lastUtcSeconds = shop.last_purchase;
    if (typeof lastUtcSeconds !== "number" || !Number.isFinite(lastUtcSeconds)) {
      return (
        <p className="shop-upgrade-info-extra subtle">
          No idle or real shop purchase is recorded yet, so the streak timer has not started (bonus stays at ×1 until
          then).
        </p>
      );
    }
    const nowUtcSeconds = Math.floor(serverNowMs / 1000);
    const elapsedSeconds = Math.max(0, nowUtcSeconds - Math.floor(lastUtcSeconds));
    return (
      <p className="shop-upgrade-info-extra subtle">
        Time since last shop purchase: {formatSeconds(elapsedSeconds, 2, "floor")}
      </p>
    );
  }

  if (upgrade.id === SHOP_UPGRADE_IDS.CONSOLIDATION) {
    if (!shop) {
      return null;
    }
    const count = countIdleShopUpgradeTypesForConsolidation(shop);
    return (
      <p className="shop-upgrade-info-extra subtle">
        Idle shop upgrade types (excluding Consolidation): {count}
      </p>
    );
  }

  return null;
}

export function ShopUpgradeInfoOverlay({
  open,
  upgrade,
  onClose,
  shop,
  estimatedServerNowMs
}: ShopUpgradeInfoOverlayProps) {
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

  if (!open || !upgrade) {
    return null;
  }

  return (
    <div className="rate-info-overlay" role="presentation" onClick={onClose}>
      <div
        className="rate-info-dialog shop-upgrade-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-upgrade-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rate-info-header">
          <h3 id="shop-upgrade-info-title">{upgrade.name}</h3>
          <button type="button" className="info-icon-button" onClick={onClose} aria-label="Close upgrade details">
            <CircleX size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="shop-upgrade-info-short subtle">{upgrade.description}</p>
        <p className="shop-upgrade-info-long">{upgrade.longDescription}</p>
        <UpgradeExtraInfo upgrade={upgrade} shop={shop} estimatedServerNowMs={estimatedServerNowMs} />
      </div>
    </div>
  );
}
