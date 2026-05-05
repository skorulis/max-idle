import { useCallback, useEffect, useState } from "react";
import { getAccount, getCurrentTournament, getHome, getPlayer } from "./api";
import { alignClientClock } from "./clientClock";
import { toSyncedState, toSyncedTournamentState } from "./playerState";
import type { AccountResponse, AvailableSurveySummary, SyncedPlayerState, SyncedTournamentState } from "./types";

type UseAppSessionParams = {
  tokenStorageKey: string;
};

export function useAppSession({ tokenStorageKey }: UseAppSessionParams) {
  const [token, setToken] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<SyncedPlayerState | null>(null);
  const [tournamentState, setTournamentState] = useState<SyncedTournamentState | null>(null);
  const [availableSurvey, setAvailableSurvey] = useState<AvailableSurveySummary | null>(null);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [, setStatus] = useState("Press start when you are ready to do nothing.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAccount = useCallback(async (currentToken: string | null) => {
    try {
      const accountResponse = await getAccount(currentToken);
      setAccount(accountResponse);
      setUsernameDraft(accountResponse.username ?? "");
    } catch (accountError) {
      if (accountError instanceof Error && accountError.message === "UNAUTHORIZED") {
        setAccount(null);
        setUsernameDraft("");
        return;
      }
      throw accountError;
    }
  }, []);

  const refreshPlayer = useCallback(async (currentToken: string | null) => {
    const player = await getPlayer(currentToken);
    const synced = toSyncedState(player);
    alignClientClock();
    setPlayerState(synced);
  }, []);

  const refreshTournament = useCallback(async (currentToken: string | null) => {
    try {
      const tournament = await getCurrentTournament(currentToken);
      const synced = toSyncedTournamentState(tournament);
      setTournamentState(synced);
    } catch (tournamentError) {
      if (tournamentError instanceof Error && tournamentError.message === "UNAUTHORIZED") {
        setTournamentState(null);
        return;
      }
      if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_FEATURE_LOCKED") {
        setTournamentState(null);
        return;
      }
      throw tournamentError;
    }
  }, []);

  const refreshHome = useCallback(async (currentToken: string | null) => {
    const home = await getHome(currentToken);
    const synced = toSyncedState(home.player);
    alignClientClock();
    setPlayerState(synced);
    setAccount(home.account);
    setUsernameDraft(home.account.username ?? "");
    if (home.tournament) {
      setTournamentState(toSyncedTournamentState(home.tournament));
    } else {
      setTournamentState(null);
    }
    setAvailableSurvey(home.availableSurvey ?? null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);

      try {
        let currentToken = localStorage.getItem(tokenStorageKey);

        try {
          await refreshHome(currentToken);
          setToken(currentToken);
          setStatus("You are doing nothing. Excellent.");
          return;
        } catch (bootstrapError) {
          if (bootstrapError instanceof Error && bootstrapError.message === "UNAUTHORIZED" && currentToken) {
            localStorage.removeItem(tokenStorageKey);
            currentToken = null;
            setToken(null);
            try {
              await refreshHome(null);
              setStatus("You are doing nothing. Excellent.");
              return;
            } catch {
              // Fall through to empty state.
            }
          }
        }

        setPlayerState(null);
        setTournamentState(null);
        setAccount(null);
        setUsernameDraft("");
        setStatus("Press start when you are ready to do nothing.");
      } catch (bootstrapError) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : "Failed to load game");
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [refreshHome, tokenStorageKey]);

  return {
    token,
    setToken,
    playerState,
    setPlayerState,
    tournamentState,
    setTournamentState,
    availableSurvey,
    setAvailableSurvey,
    account,
    setAccount,
    usernameDraft,
    setUsernameDraft,
    error,
    setError,
    loading,
    setStatus,
    refreshAccount,
    refreshPlayer,
    refreshTournament,
    refreshHome
  };
}
