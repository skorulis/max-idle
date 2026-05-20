import { useEffect, useRef } from "react";
import {
  getResearchLevel,
  getResearchProgress,
  isResearchAtMaxLevel
} from "@maxidle/shared/research";
import { getResearchItemDefinition } from "@maxidle/shared/researchItems";
import { labSpeedMultiplier } from "../app/labSpeed";
import { getResearch } from "../app/api";
import type { ResearchResponse } from "../app/types";
import { toast } from "../gameToast";

type PendingCompletion = {
  key: string;
  labIndex: number;
  researchId: string;
  levelBefore: number;
  name: string;
};

function buildCompletionKey(labIndex: number, researchId: string, startedAtMs: number): string {
  return `${labIndex}:${researchId}:${startedAtMs}`;
}

function findPendingCompletions(
  research: ResearchResponse,
  estimatedServerNowMs: number,
  reconcilingKeys: Set<string>
): PendingCompletion[] {
  const pending: PendingCompletion[] = [];

  research.research.labs.forEach((slot, labIndex) => {
    if (slot.researchId == null || slot.startedAtMs == null) {
      return;
    }

    const def = getResearchItemDefinition(slot.researchId);
    if (!def) {
      return;
    }

    const currentLevel = getResearchLevel(research.research, slot.researchId);
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

function toastForCompletedLevels(after: ResearchResponse, pending: PendingCompletion[]): void {
  for (const item of pending) {
    const levelAfter = getResearchLevel(after.research, item.researchId);
    if (levelAfter <= item.levelBefore) {
      continue;
    }

    toast.success(`Researched ${item.name} level ${levelAfter}.`);
  }
}

/** When a lab timer finishes on the client, sync via GET /research so the server records completion. */
export function useResearchLabCompletion(
  token: string | null,
  research: ResearchResponse | null,
  estimatedServerNowMs: number,
  setResearch: React.Dispatch<React.SetStateAction<ResearchResponse | null>>
): void {
  const reconcilingKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!token || !research || estimatedServerNowMs <= 0) {
      return;
    }

    const pending = findPendingCompletions(
      research,
      estimatedServerNowMs,
      reconcilingKeysRef.current
    );
    if (pending.length === 0) {
      return;
    }

    for (const item of pending) {
      reconcilingKeysRef.current.add(item.key);
    }

    void (async () => {
      try {
        const data = await getResearch(token);
        setResearch(data);
        toastForCompletedLevels(data, pending);
      } catch {
        for (const item of pending) {
          reconcilingKeysRef.current.delete(item.key);
        }
        toast.error("Could not sync completed research.");
      }
    })();
  }, [estimatedServerNowMs, research, setResearch, token]);
}
