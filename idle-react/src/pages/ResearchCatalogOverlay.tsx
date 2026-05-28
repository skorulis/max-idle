import { Atom, CircleX } from "lucide-react";
import { useEffect } from "react";
import {
  formatResearchEffectProgression,
  getResearchDurationSeconds,
  getResearchLevel,
  getResearchTimeCost,
  isResearchAtMaxLevel,
  type ResearchState
} from "@maxidle/shared/research";
import { RESEARCH_ITEMS } from "@maxidle/shared/researchItems";
import { formatSeconds } from "../formatSeconds";

type ResearchCatalogOverlayProps = {
  open: boolean;
  labIndex: number | null;
  researchState: ResearchState;
  idleTimeAvailable: number;
  blockedResearchIds?: Set<string>;
  excludeResearchId?: string | null;
  isChangingActive?: boolean;
  isPending: boolean;
  onClose: () => void;
  onSelect: (researchId: string) => void;
};

type CatalogPickerProps = {
  researchState: ResearchState;
  idleTimeAvailable: number;
  blockedResearchIds?: Set<string>;
  excludeResearchId?: string | null;
  isPending: boolean;
  onSelect: (researchId: string) => void;
};

function CatalogPicker({
  researchState,
  idleTimeAvailable,
  blockedResearchIds,
  excludeResearchId,
  isPending,
  onSelect
}: CatalogPickerProps) {
  return (
    <ul className="research-catalog">
      {RESEARCH_ITEMS.map((def) => {
        const level = getResearchLevel(researchState, def.id);
        const atMax = isResearchAtMaxLevel(def, level);
        const cost = atMax ? null : getResearchTimeCost(def, level);
        const duration = atMax ? null : getResearchDurationSeconds(def, level);
        const isCurrent = def.id === excludeResearchId;
        const isBlockedByOtherLab = blockedResearchIds?.has(def.id) ?? false;
        const canAfford = cost != null && idleTimeAvailable >= cost;

        return (
          <li key={def.id} className="research-catalog-item">
            <ResearchCatalogRow
              name={def.name}
              level={level}
              maximumLevel={def.maximumLevel}
              bonus={formatResearchEffectProgression(def, level)}
              cost={cost}
              duration={duration}
              atMax={atMax}
              isCurrent={isCurrent}
              isBlockedByOtherLab={isBlockedByOtherLab}
              canAfford={canAfford}
              isPending={isPending}
              onSelect={() => onSelect(def.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function ResearchCatalogRow({
  name,
  level,
  maximumLevel,
  bonus,
  cost,
  duration,
  atMax,
  isCurrent,
  isBlockedByOtherLab,
  canAfford,
  isPending,
  onSelect
}: {
  name: string;
  level: number;
  maximumLevel: number;
  bonus: string;
  cost: number | null;
  duration: number | null;
  atMax: boolean;
  isCurrent: boolean;
  isBlockedByOtherLab: boolean;
  canAfford: boolean;
  isPending: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="research-catalog-row">
      <div>
        <p>
          <strong>{name}</strong> — level {level}/{maximumLevel}
        </p>
        <p className="subtle">{bonus}</p>
        {!atMax && cost != null && duration != null ? (
          <p className="subtle">
            Cost <Atom size={14} aria-hidden="true" /> {formatSeconds(cost, 2, "floor")}<br/>
            Duration {formatSeconds(duration, 2, "floor")}
          </p>
        ) : null}
      </div>
      {atMax ? (
        <span className="subtle">Complete</span>
      ) : isCurrent ? (
        <span className="subtle">Current</span>
      ) : isBlockedByOtherLab ? (
        <span className="subtle">In progress</span>
      ) : (
        <button
          type="button"
          className={`secondary research-catalog-select-button${canAfford ? " shop-upgrade-buy-button-purchasable" : ""}`}
          disabled={!canAfford || isPending || isBlockedByOtherLab}
          onClick={onSelect}
        >
          Research
        </button>
      )}
    </div>
  );
}

export function ResearchCatalogOverlay({
  open,
  labIndex,
  researchState,
  idleTimeAvailable,
  blockedResearchIds,
  excludeResearchId,
  isChangingActive = false,
  isPending,
  onClose,
  onSelect
}: ResearchCatalogOverlayProps) {
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

  if (!open || labIndex == null) {
    return null;
  }

  return (
    <div className="rate-info-overlay" role="presentation" onClick={onClose}>
      <div
        className="rate-info-dialog research-catalog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-catalog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rate-info-header">
          <h3 id="research-catalog-title">
            Lab {labIndex + 1} — {isChangingActive ? "change research" : "choose research"}
          </h3>
          <button type="button" className="info-icon-button" onClick={onClose} aria-label="Close research catalog">
            <CircleX size={16} aria-hidden="true" />
          </button>
        </div>
        <CatalogPicker
          researchState={researchState}
          idleTimeAvailable={idleTimeAvailable}
          blockedResearchIds={blockedResearchIds}
          excludeResearchId={excludeResearchId}
          isPending={isPending}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
