import type { PlayerResponse, SyncedPlayerState, SyncedTournamentState, TournamentCurrentResponse } from "./types";

export function toSyncedState(data: PlayerResponse, previous?: SyncedPlayerState | null): SyncedPlayerState {
  const level =
    typeof data.level === "number" && Number.isFinite(data.level)
      ? Math.max(0, Math.floor(data.level))
      : previous !== undefined && previous !== null
        ? previous.level
        : 0;

  return {
    idleTime: data.idleTime,
    realTime: data.realTime,
    timeGems: data.timeGems,
    upgradesPurchased: data.upgradesPurchased,
    level,
    currentSeconds: data.currentSeconds,
    currentSecondsLastUpdatedMs: Date.parse(data.currentSecondsLastUpdated),
    secondsMultiplier: data.secondsMultiplier,
    shop: data.shop,
    achievementCount: data.achievementCount,
    achievementBonusMultiplier: data.achievementBonusMultiplier,
    hasUnseenAchievements: data.hasUnseenAchievements,
    lastCollectedAtMs: Date.parse(data.lastCollectedAt),
    lastDailyRewardCollectedAtMs: data.lastDailyRewardCollectedAt ? Date.parse(data.lastDailyRewardCollectedAt) : null,
    dailyBonus: data.dailyBonus ?? null,
    serverTimeMs: Date.parse(data.serverTime),
    syncedAtClientMs: Date.now(),
    tutorialProgress: data.tutorialProgress ?? "",
    obligationsCompleted: data.obligationsCompleted ?? {},
    collectionCount: data.collectionCount ?? 0
  };
}

export function toSyncedTournamentState(data: TournamentCurrentResponse): SyncedTournamentState {
  const outstanding = data.outstanding_result;
  return {
    drawAtMs: Date.parse(data.drawAt),
    isActive: data.isActive,
    hasEntered: data.hasEntered,
    playerCount: data.playerCount,
    currentRank: data.currentRank,
    expectedRewardGems: data.expectedRewardGems,
    nearbyEntries: data.nearbyEntries,
    entry: data.entry
      ? {
          enteredAtMs: Date.parse(data.entry.enteredAt),
          finalRank: data.entry.finalRank,
          timeScoreSeconds: data.entry.timeScoreSeconds,
          gemsAwarded: data.entry.gemsAwarded,
          finalizedAtMs: data.entry.finalizedAt ? Date.parse(data.entry.finalizedAt) : null
        }
      : null,
    outstandingResult: outstanding
      ? {
          tournamentId: outstanding.tournamentId,
          drawAtMs: Date.parse(outstanding.drawAt),
          finalizedAtMs: Date.parse(outstanding.finalizedAt),
          finalRank: outstanding.finalRank,
          gemsAwarded: outstanding.gemsAwarded,
          playerCount: outstanding.playerCount
        }
      : null,
    syncedAtClientMs: Date.now()
  };
}

export function getTournamentSecondsUntilDraw(drawAtMs: number, estimatedServerNowMs: number): number {
  return Math.max(0, Math.ceil((drawAtMs - estimatedServerNowMs) / 1000));
}

/** Whole seconds until 00:00:00 UTC on the next calendar day (daily bonus / daily reward UTC boundary). */
export function getSecondsUntilNextUtcDayBoundary(estimatedServerNowMs: number): number {
  const now = new Date(estimatedServerNowMs);
  const nextUtcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, Math.ceil((nextUtcDayStartMs - estimatedServerNowMs) / 1000));
}
