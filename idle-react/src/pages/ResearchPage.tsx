import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatResearchEffectProgression,
  getResearchLevel,
  getResearchProgress,
  getResearchRemainingSeconds,
  getResearchTimeCost
} from "@maxidle/shared/research";
import { getResearchItemDefinition, type ResearchItemDefinition } from "@maxidle/shared/researchItems";
import { labSpeedMultiplier } from "../app/labSpeed";
import type { ResearchResponse } from "../app/types";
import { changeResearch, startResearch } from "../app/api";
import { formatSeconds } from "../formatSeconds";
import GameIcon from "../GameIcon";
import { ResearchCatalogOverlay } from "./ResearchCatalogOverlay";
import { useResearchLabCompletion } from "./useResearchLabCompletion";

type ResearchPageProps = {
  token: string | null;
  research: ResearchResponse | null;
  researchLoading: boolean;
  setResearch: React.Dispatch<React.SetStateAction<ResearchResponse | null>>;
  hasError: boolean;
  estimatedServerNowMs: number;
};

function getLiveProgress(
  def: ResearchItemDefinition,
  currentLevel: number,
  startedAtMs: number | null,
  estimatedServerNowMs: number
): number | null {
  if (startedAtMs == null) {
    return null;
  }
  return getResearchProgress(
    def,
    currentLevel,
    startedAtMs,
    estimatedServerNowMs,
    labSpeedMultiplier
  );
}

function ResearchProgressBar({
  fraction,
  remainingSeconds,
  label
}: {
  fraction: number;
  remainingSeconds: number;
  label: string;
}) {
  const pct = Math.min(100, Math.max(0, fraction * 100));
  const remainingLabel = formatSeconds(remainingSeconds, 2, "ceil");

  return (
    <div
      className="research-progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}, ${remainingLabel} remaining`}
    >
      <div className="research-progress-fill" style={{ width: `${pct}%` }} />
      <span className="research-progress-label" aria-hidden="true">
        {remainingLabel}
      </span>
    </div>
  );
}

export function ResearchPage({
  token,
  research,
  researchLoading,
  setResearch,
  hasError,
  estimatedServerNowMs
}: ResearchPageProps) {
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingLabIndex, setPendingLabIndex] = useState<number | null>(null);
  const [catalogOverlayLabIndex, setCatalogOverlayLabIndex] = useState<number | null>(null);

  useResearchLabCompletion(token, research, estimatedServerNowMs, setResearch);

  const handleSelectResearch = async (labIndex: number, researchId: string) => {
    if (!research) {
      return;
    }
    setPendingLabIndex(labIndex);
    setActionError(null);
    const slot = research.research.labs[labIndex];
    const isActive = slot?.startedAtMs != null;

    try {
      const data = isActive
        ? await changeResearch(token, labIndex, researchId)
        : await startResearch(token, labIndex, researchId);
      setResearch(data);
      setCatalogOverlayLabIndex(null);
    } catch (selectError) {
      setActionError(
        selectError instanceof Error ? selectError.message : "Failed to update research"
      );
    } finally {
      setPendingLabIndex(null);
    }
  };

  if (researchLoading) {
    return (
      <section className="card">
        <p className="subtle">Loading research labs…</p>
      </section>
    );
  }

  if (!research) {
    return (
      <section className="card">
        <p className="subtle">
          {hasError ? "Could not load research." : "Research unavailable."}
        </p>
      </section>
    );
  }

  const researchState = research.research;

  return (
    <>
      <section className="card">
        <h1 className="section-title-with-icon">
          <GameIcon icon={FlaskConical} />
          Research labs
        </h1>
        <p className="subtle">
          Available idle time: {formatSeconds(research.idleTimeAvailable, 2, "floor")}
        </p>
        {actionError ? <p className="message-copy">{actionError}</p> : null}
      </section>

      {research.unlockedLabCount === 0 ? (
        <section className="card">
          <p className="subtle">Unlock a research lab from the shop to begin researching upgrades.</p>
          <button type="button" className="secondary" onClick={() => navigate("/shop")}>
            Go to shop
          </button>
        </section>
      ) : (
        researchState.labs.map((slot, labIndex) => {
          const isPending = pendingLabIndex === labIndex;
          const def =
            slot.researchId != null ? getResearchItemDefinition(slot.researchId) : null;
          const currentLevel =
            slot.researchId != null ? getResearchLevel(researchState, slot.researchId) : 0;
          const isActive = slot.startedAtMs != null;
          const liveProgress =
            def != null && isActive
              ? getLiveProgress(def, currentLevel, slot.startedAtMs, estimatedServerNowMs)
              : null;

          return (
            <section className="card" key={labIndex}>
              <h2>Lab {labIndex + 1}</h2>
              {def && isActive && liveProgress != null ? (
                <>
                  <p>
                    <strong>{def.name}</strong> — level {currentLevel}/{def.maximumLevel}
                  </p>
                  <p className="subtle">
                    {formatResearchEffectProgression(def, currentLevel)}
                  </p>
                  <ResearchProgressBar
                    fraction={liveProgress}
                    remainingSeconds={
                      def != null && slot.startedAtMs != null
                        ? (getResearchRemainingSeconds(
                            def,
                            currentLevel,
                            slot.startedAtMs,
                            estimatedServerNowMs,
                            labSpeedMultiplier
                          ) ?? 0)
                        : 0
                    }
                    label={`Research progress for ${def.name}`}
                  />
                  <button
                    type="button"
                    className="secondary"
                    disabled={isPending}
                    onClick={() => setCatalogOverlayLabIndex(labIndex)}
                  >
                    Change research
                  </button>
                </>
              ) : (
                <>
                  <p className="research-offline-status" aria-label="Lab offline">
                    OFFLINE
                  </p>
                  <button
                    type="button"
                    className="collect"
                    disabled={isPending}
                    onClick={() => setCatalogOverlayLabIndex(labIndex)}
                  >
                    Start research
                  </button>
                </>
              )}
            </section>
          );
        })
      )}
      <ResearchCatalogOverlay
        open={catalogOverlayLabIndex != null}
        labIndex={catalogOverlayLabIndex}
        researchState={researchState}
        idleTimeAvailable={(() => {
          if (catalogOverlayLabIndex == null) {
            return research.idleTimeAvailable;
          }
          const overlaySlot = researchState.labs[catalogOverlayLabIndex];
          if (overlaySlot?.startedAtMs == null || overlaySlot.researchId == null) {
            return research.idleTimeAvailable;
          }
          const currentDef = getResearchItemDefinition(overlaySlot.researchId);
          if (!currentDef) {
            return research.idleTimeAvailable;
          }
          return (
            research.idleTimeAvailable +
            getResearchTimeCost(currentDef, getResearchLevel(researchState, overlaySlot.researchId))
          );
        })()}
        excludeResearchId={
          catalogOverlayLabIndex != null &&
          researchState.labs[catalogOverlayLabIndex]?.startedAtMs != null
            ? researchState.labs[catalogOverlayLabIndex]?.researchId
            : null
        }
        isChangingActive={
          catalogOverlayLabIndex != null &&
          researchState.labs[catalogOverlayLabIndex]?.startedAtMs != null
        }
        isPending={pendingLabIndex === catalogOverlayLabIndex}
        onClose={() => setCatalogOverlayLabIndex(null)}
        onSelect={(researchId) => {
          if (catalogOverlayLabIndex != null) {
            void handleSelectResearch(catalogOverlayLabIndex, researchId);
          }
        }}
      />
    </>
  );
}
