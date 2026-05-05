import { useEffect, useMemo, useState } from "react";
import { OBLIGATION_IDS } from "@maxidle/shared/obligations";
import { isTournamentFeatureUnlocked } from "../shop";
import {
  getAchievements,
  getCollectionHistory,
  getDailyBonusHistory,
  getLeaderboard,
  getPublicPlayerProfile,
  getTournamentHistory,
  markAchievementsSeen
} from "./api";
import type {
  AchievementsResponse,
  CollectionHistoryItem,
  DailyBonusHistoryItem,
  LeaderboardResponse,
  LeaderboardType,
  PlayerProfileResponse,
  SyncedPlayerState,
  TournamentHistoryItem
} from "./types";

type UseAppRouteDataLoadersParams = {
  locationPathname: string;
  token: string | null;
  accountGameUserId?: string;
  playerState: SyncedPlayerState | null;
  setPlayerState: React.Dispatch<React.SetStateAction<SyncedPlayerState | null>>;
  routePlayerIdParam?: string;
  setError: (message: string | null) => void;
};

export function useAppRouteDataLoaders({
  locationPathname,
  token,
  accountGameUserId,
  playerState,
  setPlayerState,
  routePlayerIdParam,
  setError
}: UseAppRouteDataLoadersParams) {
  const [publicPlayerProfile, setPublicPlayerProfile] = useState<PlayerProfileResponse["player"] | null>(null);
  const [publicPlayerLoading, setPublicPlayerLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>("current");
  const [achievements, setAchievements] = useState<AchievementsResponse | null>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [dailyBonusHistory, setDailyBonusHistory] = useState<DailyBonusHistoryItem[]>([]);
  const [dailyBonusHistoryLoading, setDailyBonusHistoryLoading] = useState(false);
  const [collectionHistory, setCollectionHistory] = useState<CollectionHistoryItem[]>([]);
  const [collectionHistoryLoading, setCollectionHistoryLoading] = useState(false);
  const [tournamentHistory, setTournamentHistory] = useState<TournamentHistoryItem[]>([]);
  const [tournamentHistoryLoading, setTournamentHistoryLoading] = useState(false);

  const routePlayerId = useMemo(() => {
    if (!routePlayerIdParam) {
      return null;
    }
    try {
      return decodeURIComponent(routePlayerIdParam);
    } catch {
      return routePlayerIdParam;
    }
  }, [routePlayerIdParam]);

  useEffect(() => {
    if (locationPathname !== "/dailybonus") {
      return;
    }
    if (!playerState || playerState.obligationsCompleted[OBLIGATION_IDS.RAMP_UP] !== true) {
      return;
    }
    let cancelled = false;
    const loadDailyBonusHistory = async () => {
      setDailyBonusHistoryLoading(true);
      setError(null);
      try {
        const nextHistory = await getDailyBonusHistory(token);
        if (!cancelled) {
          setDailyBonusHistory(nextHistory);
        }
      } catch (dailyBonusHistoryError) {
        if (cancelled) {
          return;
        }
        setDailyBonusHistory([]);
        if (dailyBonusHistoryError instanceof Error && dailyBonusHistoryError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view daily bonus history.");
          return;
        }
        if (dailyBonusHistoryError instanceof Error && dailyBonusHistoryError.message === "DAILY_BONUS_FEATURE_LOCKED") {
          setError("Complete the Ramp up obligation to view history.");
          return;
        }
        setError(dailyBonusHistoryError instanceof Error ? dailyBonusHistoryError.message : "Failed to load daily bonus history.");
      } finally {
        if (!cancelled) {
          setDailyBonusHistoryLoading(false);
        }
      }
    };
    void loadDailyBonusHistory();
    return () => {
      cancelled = true;
    };
  }, [accountGameUserId, locationPathname, playerState, setError, token]);

  useEffect(() => {
    if (locationPathname !== "/collection") {
      return;
    }
    let cancelled = false;
    const loadCollectionHistory = async () => {
      setCollectionHistoryLoading(true);
      setError(null);
      try {
        const nextHistory = await getCollectionHistory(token);
        if (!cancelled) {
          setCollectionHistory(nextHistory);
        }
      } catch (collectionHistoryError) {
        if (cancelled) {
          return;
        }
        setCollectionHistory([]);
        if (collectionHistoryError instanceof Error && collectionHistoryError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view collection history.");
          return;
        }
        setError(collectionHistoryError instanceof Error ? collectionHistoryError.message : "Failed to load collection history.");
      } finally {
        if (!cancelled) {
          setCollectionHistoryLoading(false);
        }
      }
    };
    void loadCollectionHistory();
    return () => {
      cancelled = true;
    };
  }, [accountGameUserId, locationPathname, setError, token]);

  useEffect(() => {
    if (locationPathname !== "/tournament") {
      return;
    }
    if (!playerState || !isTournamentFeatureUnlocked(playerState.shop)) {
      return;
    }
    let cancelled = false;
    const loadTournamentHistory = async () => {
      setTournamentHistoryLoading(true);
      setError(null);
      try {
        const nextHistory = await getTournamentHistory(token);
        if (!cancelled) {
          setTournamentHistory(nextHistory);
        }
      } catch (tournamentHistoryError) {
        if (cancelled) {
          return;
        }
        setTournamentHistory([]);
        if (tournamentHistoryError instanceof Error && tournamentHistoryError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view tournament history.");
          return;
        }
        if (tournamentHistoryError instanceof Error && tournamentHistoryError.message === "TOURNAMENT_FEATURE_LOCKED") {
          setError("Purchase Weekly Tournament in the shop to view history.");
          return;
        }
        setError(
          tournamentHistoryError instanceof Error ? tournamentHistoryError.message : "Failed to load tournament history."
        );
      } finally {
        if (!cancelled) {
          setTournamentHistoryLoading(false);
        }
      }
    };
    void loadTournamentHistory();
    return () => {
      cancelled = true;
    };
  }, [accountGameUserId, locationPathname, playerState, setError, token]);

  useEffect(() => {
    if (locationPathname !== "/leaderboard") {
      return;
    }
    let cancelled = false;
    const loadLeaderboard = async () => {
      setLeaderboardLoading(true);
      setError(null);
      try {
        const nextLeaderboard = await getLeaderboard(token, leaderboardType);
        if (!cancelled) {
          setLeaderboard(nextLeaderboard);
        }
      } catch (leaderboardError) {
        if (cancelled) {
          return;
        }
        setLeaderboard(null);
        if (leaderboardError instanceof Error && leaderboardError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view the leaderboard.");
          return;
        }
        setError(leaderboardError instanceof Error ? leaderboardError.message : "Failed to load leaderboard.");
      } finally {
        if (!cancelled) {
          setLeaderboardLoading(false);
        }
      }
    };
    void loadLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [accountGameUserId, leaderboardType, locationPathname, setError, token]);

  useEffect(() => {
    if (locationPathname !== "/achievements") {
      return;
    }
    let cancelled = false;
    const loadAchievements = async () => {
      setAchievementsLoading(true);
      setError(null);
      try {
        const nextAchievements = await getAchievements(token);
        if (!cancelled) {
          setAchievements(nextAchievements);
        }
      } catch (achievementsError) {
        if (cancelled) {
          return;
        }
        setAchievements(null);
        if (achievementsError instanceof Error && achievementsError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view achievements.");
          return;
        }
        setError(achievementsError instanceof Error ? achievementsError.message : "Failed to load achievements.");
      } finally {
        if (!cancelled) {
          setAchievementsLoading(false);
        }
      }
    };
    void loadAchievements();
    return () => {
      cancelled = true;
    };
  }, [accountGameUserId, locationPathname, setError, token]);

  useEffect(() => {
    if (locationPathname !== "/achievements" || !playerState?.hasUnseenAchievements) {
      return;
    }
    let cancelled = false;
    const clearUnseenAchievements = async () => {
      try {
        await markAchievementsSeen(token);
        if (!cancelled) {
          setPlayerState((previousState) =>
            previousState
              ? {
                  ...previousState,
                  hasUnseenAchievements: false
                }
              : previousState
          );
        }
      } catch (markSeenError) {
        if (cancelled) {
          return;
        }
        if (markSeenError instanceof Error && markSeenError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view achievements.");
          return;
        }
        setError(markSeenError instanceof Error ? markSeenError.message : "Failed to clear achievement badge.");
      }
    };
    void clearUnseenAchievements();
    return () => {
      cancelled = true;
    };
  }, [locationPathname, playerState?.hasUnseenAchievements, setError, setPlayerState, token]);

  useEffect(() => {
    if (!routePlayerId) {
      return;
    }
    let cancelled = false;
    const loadPlayerProfile = async () => {
      setPublicPlayerLoading(true);
      setError(null);
      try {
        const profileResponse = await getPublicPlayerProfile(routePlayerId);
        if (!cancelled) {
          setPublicPlayerProfile(profileResponse.player);
        }
      } catch (profileError) {
        if (cancelled) {
          return;
        }
        setPublicPlayerProfile(null);
        if (profileError instanceof Error && profileError.message === "PLAYER_NOT_FOUND") {
          return;
        }
        setError(profileError instanceof Error ? profileError.message : "Failed to load player profile.");
      } finally {
        if (!cancelled) {
          setPublicPlayerLoading(false);
        }
      }
    };
    void loadPlayerProfile();
    return () => {
      cancelled = true;
    };
  }, [locationPathname, routePlayerId, setError]);

  return {
    publicPlayerProfile,
    publicPlayerLoading,
    leaderboard,
    leaderboardLoading,
    leaderboardType,
    setLeaderboardType,
    achievements,
    achievementsLoading,
    dailyBonusHistory,
    dailyBonusHistoryLoading,
    collectionHistory,
    collectionHistoryLoading,
    tournamentHistory,
    tournamentHistoryLoading
  };
}
