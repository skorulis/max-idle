import { useEffect } from "react";
import { CircleX } from "lucide-react";
import type { ShopUpgradeDefinition } from "../shopUpgrades";

type ShopUpgradeInfoOverlayProps = {
  open: boolean;
  upgrade: ShopUpgradeDefinition | null;
  onClose: () => void;
};

export function ShopUpgradeInfoOverlay({ open, upgrade, onClose }: ShopUpgradeInfoOverlayProps) {
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
      </div>
    </div>
  );
}
