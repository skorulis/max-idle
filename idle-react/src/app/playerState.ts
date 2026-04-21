import type { PlayerResponse, SyncedPlayerState } from "./types";

export function toSyncedState(data: PlayerResponse): SyncedPlayerState {
  return {
    totalIdleSeconds: data.totalIdleSeconds,
    collectedIdleSeconds: data.collectedIdleSeconds,
    upgradesPurchased: data.upgradesPurchased,
    currentSeconds: data.currentSeconds,
    currentSecondsLastUpdatedMs: Date.parse(data.currentSecondsLastUpdated),
    secondsMultiplier: data.secondsMultiplier,
    achievementBonusMultiplier: data.achievementBonusMultiplier,
    lastCollectedAtMs: Date.parse(data.lastCollectedAt),
    serverTimeMs: Date.parse(data.serverTime),
    syncedAtClientMs: Date.now()
  };
}
