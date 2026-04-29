import type { PlayerResponse, SyncedPlayerState, SyncedTournamentState, TournamentCurrentResponse } from "./types";

export function toSyncedState(data: PlayerResponse): SyncedPlayerState {
  return {
    idleTime: data.idleTime,
    realTime: data.realTime,
    timeGems: data.timeGems,
    upgradesPurchased: data.upgradesPurchased,
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
    syncedAtClientMs: Date.now()
  };
}

export function toSyncedTournamentState(data: TournamentCurrentResponse): SyncedTournamentState {
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
    syncedAtClientMs: Date.now()
  };
}

export function getTournamentSecondsUntilDraw(drawAtMs: number, estimatedServerNowMs: number): number {
  return Math.max(0, Math.ceil((drawAtMs - estimatedServerNowMs) / 1000));
}
