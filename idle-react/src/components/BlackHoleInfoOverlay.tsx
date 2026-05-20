import { useEffect } from "react";
import { CircleX } from "lucide-react";
import "./BlackHoleInfoOverlay.css";

type BlackHoleInfoOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export function BlackHoleInfoOverlay({ open, onClose }: BlackHoleInfoOverlayProps) {
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

  if (!open) {
    return null;
  }

  return (
    <div className="rate-info-overlay" role="presentation" onClick={onClose}>
      <div
        className="rate-info-dialog black-hole-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="black-hole-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rate-info-header">
          <h3 id="black-hole-info-title">Black hole</h3>
          <button type="button" className="info-icon-button" onClick={onClose} aria-label="Close black hole details">
            <CircleX size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="black-hole-info-lead subtle">
          The black hole will dilate time giving you a multiplier to your idle rate.
          Feed the black hole each day to grow its mass and strengthen the time dilation effect.
        </p>
      </div>
    </div>
  );
}
