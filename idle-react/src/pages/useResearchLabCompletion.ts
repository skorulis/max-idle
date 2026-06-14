import { useEffect, useRef } from "react";
import {
  getResearchLevel,
  getResearchProgress,
  isResearchAtMaxLevel,
  type ResearchState
} from "@maxidle/shared/research";
import { getResearchItemDefinition } from "@maxidle/shared/researchItems";
import { labSpeedMultiplier } from "../app/labSpeed";
import { toast } from "../gameToast";

type PendingCompletion = {
  key: string;
  labIndex: number;
  researchId: string;
  levelBefore: number;
  name: string;
};

type UseResearchLabCompletionParams = {
  token: string | null;
  research: ResearchState | null;
  estimatedServerNowMs: number;
  onSync: () => Promise<ResearchState>;
};

function buildCompletionKey(labIndex: number, researchId: string, startedAtMs: number): string {
  return `${labIndex}:${researchId}:${startedAtMs}`;
}

function findPendingCompletions(
  research: ResearchState,
  estimatedServerNowMs: number,
  reconcilingKeys: Set<string>
): PendingCompletion[] {
  const pending: PendingCompletion[] = [];

  research.labs.forEach((slot, labIndex) => {
    if (slot.researchId == null || slot.startedAtMs == null) {
      return;
    }

    const def = getResearchItemDefinition(slot.researchId);
    if (!def) {
      return;
    }

    const currentLevel = getResearchLevel(research, slot.researchId);
    if (isResearchAtMaxLevel(def, currentLevel)) {
      return;
    }

    const progress = getResearchProgress(
      def,
      currentLevel,
      slot.startedAtMs,
      estimatedServerNowMs,
      labSpeedMultiplier
    );
    if (progress == null || progress < 1) {
      return;
    }

    const key = buildCompletionKey(labIndex, slot.researchId, slot.startedAtMs);
    if (reconcilingKeys.has(key)) {
      return;
    }

    pending.push({
      key,
      labIndex,
      researchId: slot.researchId,
      levelBefore: currentLevel,
      name: def.name
    });
  });

  return pending;
}

function toastForCompletedLevels(after: ResearchState, pending: PendingCompletion[]): void {
  for (const item of pending) {
    const levelAfter = getResearchLevel(after, item.researchId);
    if (levelAfter <= item.levelBefore) {
      continue;
    }

    toast.success(`Researched ${item.name} level ${levelAfter}.`);
  }
}

/** When a lab timer finishes on the client, sync with the server so completion is recorded. */
export function useResearchLabCompletion({
  token,
  research,
  estimatedServerNowMs,
  onSync
}: UseResearchLabCompletionParams): void {
  const reconcilingKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!token || !research || estimatedServerNowMs <= 0) {
      return;
    }

    const pending = findPendingCompletions(research, estimatedServerNowMs, reconcilingKeysRef.current);
    if (pending.length === 0) {
      return;
    }

    for (const item of pending) {
      reconcilingKeysRef.current.add(item.key);
    }

    void (async () => {
      try {
        const syncedResearch = await onSync();
        toastForCompletedLevels(syncedResearch, pending);
      } catch {
        for (const item of pending) {
          reconcilingKeysRef.current.delete(item.key);
        }
        toast.error("Could not sync completed research.");
      }
    })();
  }, [estimatedServerNowMs, onSync, research, token]);
}
