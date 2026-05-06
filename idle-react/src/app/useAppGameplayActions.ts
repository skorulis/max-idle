import { useState, type Dispatch, type SetStateAction } from "react";
import { toast, toastCollectIdle } from "../gameToast";
import { SHOP_UPGRADES_BY_ID, type ShopUpgradeId } from "../shopUpgrades";
import { alignClientClock } from "./clientClock";
import { toSyncedState, toSyncedTournamentState } from "./playerState";
import {
  collectDailyBonus,
  collectDailyReward,
  collectIdleTime,
  collectObligation,
  collectTournamentReward,
  completeTutorialStep,
  createAnonymousSession,
  debugAddGems,
  debugAddIdleTime,
  debugAddRealTime,
  debugFinalizeCurrentTournament,
  debugResetBalances,
  debugResetCurrentDailyBonus,
  enterTournament,
  purchaseUpgrade,
  resetTutorialProgress,
  upgradePlayerLevel
} from "./api";
import type { ObligationId } from "@maxidle/shared/obligations";
import type { SyncedPlayerState, SyncedTournamentState } from "./types";

type UseAppGameplayActionsParams = {
  token: string | null;
  setToken: (value: string | null) => void;
  playerState: SyncedPlayerState | null;
  setPlayerState: Dispatch<SetStateAction<SyncedPlayerState | null>>;
  setTournamentState: Dispatch<SetStateAction<SyncedTournamentState | null>>;
  setAccount: (value: null) => void;
  setStatus: (message: string) => void;
  setError: (message: string | null) => void;
  refreshAccount: (token: string | null) => Promise<void>;
  refreshPlayer: (token: string | null) => Promise<void>;
  refreshTournament: (token: string | null) => Promise<void>;
  refreshHome: (token: string | null) => Promise<void>;
  isCollectBlockedByRestraint: boolean;
  restraintCollectBlockedMessage: string;
  tokenStorageKey: string;
  shopAlreadyOwnedMessage: Partial<Record<ShopUpgradeId, string>>;
};

export function useAppGameplayActions({
  token,
  setToken,
  playerState,
  setPlayerState,
  setTournamentState,
  setAccount,
  setStatus,
  setError,
  refreshAccount,
  refreshPlayer,
  refreshTournament,
  refreshHome,
  isCollectBlockedByRestraint,
  restraintCollectBlockedMessage,
  tokenStorageKey,
  shopAlreadyOwnedMessage
}: UseAppGameplayActionsParams) {
  const [starting, setStarting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectingDailyReward, setCollectingDailyReward] = useState(false);
  const [collectingDailyBonus, setCollectingDailyBonus] = useState(false);
  const [collectingObligation, setCollectingObligation] = useState(false);
  const [enteringTournament, setEnteringTournament] = useState(false);
  const [collectingTournamentReward, setCollectingTournamentReward] = useState(false);
  const [shopPendingQuantity, setShopPendingQuantity] = useState<ShopUpgradeId | "player_level" | null>(null);
  const [resettingDailyBonus, setResettingDailyBonus] = useState(false);
  const [debugPendingAction, setDebugPendingAction] = useState<"real" | "idle" | "gems" | "balances" | "tournament" | null>(
    null
  );

  const clearUnauthorizedSession = () => {
    localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setPlayerState(null);
    setTournamentState(null);
    setAccount(null);
    setStatus("Press start when you are ready to do nothing.");
  };

  const onCollect = async (): Promise<
    { collectedSeconds: number; realSecondsCollected: number } | undefined
  > => {
    if (!playerState) {
      return undefined;
    }
    if (isCollectBlockedByRestraint) {
      setError(restraintCollectBlockedMessage);
      setStatus("Keep idling to satisfy Restraint.");
      return undefined;
    }
    setCollecting(true);
    setError(null);
    setStatus("Collecting your hard-earned inactivity...");
    try {
      const nextPlayer = await collectIdleTime(token);
      const collectedSeconds = nextPlayer.collectedSeconds ?? 0;
      const realSecondsCollected = nextPlayer.realSecondsCollected ?? 0;
      toastCollectIdle(collectedSeconds, realSecondsCollected);
      const synced = toSyncedState(nextPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      await refreshAccount(token);
      setStatus("Collected. You may now continue doing nothing.");
      return { collectedSeconds, realSecondsCollected };
    } catch (collectError) {
      if (collectError instanceof Error && collectError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else if (collectError instanceof Error && collectError.message === "RESTRAINT_BLOCKED") {
        setError(restraintCollectBlockedMessage);
        return;
      }
      setError(collectError instanceof Error ? collectError.message : "Collect failed");
      setStatus("Your inactivity transfer was interrupted.");
      return undefined;
    } finally {
      setCollecting(false);
    }
  };

  const onUpgradePlayerLevel = async () => {
    if (!playerState) {
      return;
    }
    setShopPendingQuantity("player_level");
    setError(null);
    try {
      const updatedPlayer = await upgradePlayerLevel(token);
      const synced = toSyncedState(updatedPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      toast.success(`Reached player level ${synced.level}.`);
    } catch (upgradeError) {
      if (upgradeError instanceof Error && upgradeError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else if (upgradeError instanceof Error && upgradeError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough idle and real time for that upgrade.");
      } else if (upgradeError instanceof Error && upgradeError.message === "MAX_LEVEL") {
        setError("Player level is already maxed.");
      } else {
        setError(upgradeError instanceof Error ? upgradeError.message : "Level upgrade failed");
      }
      setStatus("Could not upgrade player level.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseUpgrade = async (upgradeId: ShopUpgradeId) => {
    if (!playerState) {
      return;
    }
    setShopPendingQuantity(upgradeId);
    setError(null);
    try {
      const updatedPlayer = await purchaseUpgrade(token, upgradeId);
      const synced = toSyncedState(updatedPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      const purchasedUpgrade = SHOP_UPGRADES_BY_ID[upgradeId];
      const purchasedLevel = purchasedUpgrade.currentLevel(synced.shop);
      const shopToastMessage =
        purchasedLevel > 0 ? `Purchased ${purchasedUpgrade.name} level ${purchasedLevel}` : `Purchased ${purchasedUpgrade.name}`;
      toast.success(shopToastMessage);
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough resources for that purchase.");
      } else if (purchaseError instanceof Error && purchaseError.message === "ALREADY_OWNED") {
        setError(shopAlreadyOwnedMessage[upgradeId] ?? purchaseError.message);
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onDebugAddGems = async () => {
    if (!playerState) {
      return;
    }
    setDebugPendingAction("gems");
    setError(null);
    setStatus("Adding debug gems...");
    try {
      const updatedPlayer = await debugAddGems(token);
      const synced = toSyncedState(updatedPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Added 5 debug gems.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to add debug gems");
      toast.error("Could not add debug gems.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugResetDailyBonus = async () => {
    if (!playerState) {
      return;
    }
    setResettingDailyBonus(true);
    setError(null);
    try {
      await debugResetCurrentDailyBonus(token);
      await refreshPlayer(token);
      toast.success("Reset current daily bonus.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to reset daily bonus");
    } finally {
      setResettingDailyBonus(false);
    }
  };

  const onDebugAddRealTime = async () => {
    if (!playerState) {
      return;
    }
    setDebugPendingAction("real");
    setError(null);
    setStatus("Adding debug real time...");
    try {
      const updatedPlayer = await debugAddRealTime(token);
      const synced = toSyncedState(updatedPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Added 12 hours of real time.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to add debug real time");
      toast.error("Could not add debug real time.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugAddIdleTime = async () => {
    if (!playerState) {
      return;
    }
    setDebugPendingAction("idle");
    setError(null);
    setStatus("Adding debug idle time...");
    try {
      const updatedPlayer = await debugAddIdleTime(token);
      const synced = toSyncedState(updatedPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Added 12 hours of idle time.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to add debug idle time");
      toast.error("Could not add debug idle time.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugResetBalances = async () => {
    if (!playerState) {
      return;
    }
    setDebugPendingAction("balances");
    setError(null);
    setStatus("Resetting balances...");
    try {
      const updatedPlayer = await debugResetBalances(token);
      const synced = toSyncedState(updatedPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Reset all balances to zero.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to reset balances");
      toast.error("Could not reset balances.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugFinalizeTournament = async () => {
    if (!playerState) {
      return;
    }
    setDebugPendingAction("tournament");
    setError(null);
    setStatus("Finalizing tournament...");
    try {
      const result = await debugFinalizeCurrentTournament(token);
      if (!result.ok) {
        toast.error("No active tournament.");
        return;
      }
      await refreshHome(token);
      toast.success(
        `Tournament finalized (${result.entryCount} entr${result.entryCount === 1 ? "y" : "ies"}). New round #${result.newTournamentId}.`
      );
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to finalize tournament");
      toast.error("Could not finalize tournament.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onCollectDailyReward = async () => {
    if (!playerState) {
      return;
    }
    setCollectingDailyReward(true);
    setError(null);
    try {
      const nextPlayer = await collectDailyReward(token);
      const synced = toSyncedState(nextPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Daily reward collected.");
    } catch (dailyRewardError) {
      if (dailyRewardError instanceof Error && dailyRewardError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else if (dailyRewardError instanceof Error && dailyRewardError.message === "DAILY_REWARD_NOT_AVAILABLE") {
        setError("Daily reward already collected today. Next reset is 00:00:00 UTC.");
      } else {
        setError(dailyRewardError instanceof Error ? dailyRewardError.message : "Daily reward collection failed");
      }
    } finally {
      setCollectingDailyReward(false);
    }
  };

  const onCollectObligation = async (obligationId: ObligationId) => {
    if (!playerState) {
      return;
    }
    setCollectingObligation(true);
    setError(null);
    try {
      const nextPlayer = await collectObligation(token, obligationId);
      const synced = toSyncedState(nextPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Obligation completed.");
    } catch (obligationError) {
      if (obligationError instanceof Error && obligationError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else {
        const message = obligationError instanceof Error ? obligationError.message : "Could not collect obligation reward";
        setError(message);
        toast.error(message);
      }
    } finally {
      setCollectingObligation(false);
    }
  };

  const onCompleteTutorialStep = async (tutorialId: string) => {
    if (!playerState) {
      return;
    }
    setError(null);
    try {
      const nextPlayer = await completeTutorialStep(token, tutorialId);
      const synced = toSyncedState(nextPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
    } catch (tutorialError) {
      if (tutorialError instanceof Error && tutorialError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else {
        setError(tutorialError instanceof Error ? tutorialError.message : "Could not update tutorial progress");
        toast.error("Could not save tutorial progress.");
      }
    }
  };

  const onResetTutorial = async () => {
    if (!playerState) {
      return;
    }
    setError(null);
    try {
      const nextPlayer = await resetTutorialProgress(token);
      const synced = toSyncedState(nextPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Tutorial reset. You will see the intro again on the home page.");
    } catch (tutorialError) {
      if (tutorialError instanceof Error && tutorialError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else {
        setError(tutorialError instanceof Error ? tutorialError.message : "Could not reset tutorial");
        toast.error("Could not reset tutorial.");
      }
    }
  };

  const onCollectDailyBonus = async () => {
    if (!playerState) {
      return;
    }
    setCollectingDailyBonus(true);
    setError(null);
    try {
      const nextPlayer = await collectDailyBonus(token);
      const synced = toSyncedState(nextPlayer, playerState);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Daily bonus activated.");
    } catch (dailyBonusError) {
      if (dailyBonusError instanceof Error && dailyBonusError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else if (dailyBonusError instanceof Error && dailyBonusError.message === "DAILY_BONUS_INSUFFICIENT_IDLE") {
        setError("Not enough idle time in the bank to activate today's daily bonus.");
      } else if (dailyBonusError instanceof Error && dailyBonusError.message === "DAILY_BONUS_ALREADY_CLAIMED") {
        setError("Daily bonus already activated today.");
      } else if (dailyBonusError instanceof Error && dailyBonusError.message === "DAILY_BONUS_FEATURE_LOCKED") {
        setError("Purchase Daily Bonus in the shop to activate.");
      } else {
        setError(dailyBonusError instanceof Error ? dailyBonusError.message : "Daily bonus collection failed");
      }
    } finally {
      setCollectingDailyBonus(false);
    }
  };

  const onEnterTournament = async () => {
    if (!playerState) {
      return;
    }
    setEnteringTournament(true);
    setError(null);
    try {
      const response = await enterTournament(token);
      setTournamentState(toSyncedTournamentState(response.tournament));
      setStatus(response.enteredNow ? "Entered weekly tournament." : "Already entered in this week's tournament.");
    } catch (tournamentError) {
      if (tournamentError instanceof Error && tournamentError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_DRAW_IN_PROGRESS") {
        setError("Tournament draw is finalizing. Please retry in a moment.");
        void refreshTournament(token).catch(() => {
          // Ignore refresh errors and keep current state.
        });
      } else if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_FEATURE_LOCKED") {
        setError("Purchase Weekly Tournament in the shop to enter.");
      } else if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_REWARD_UNCOLLECTED") {
        setError("Collect your last tournament reward before entering this week's draw.");
      } else {
        setError(tournamentError instanceof Error ? tournamentError.message : "Failed to enter tournament");
      }
    } finally {
      setEnteringTournament(false);
    }
  };

  const onCollectTournamentReward = async () => {
    if (!playerState) {
      return;
    }
    setCollectingTournamentReward(true);
    setError(null);
    try {
      const result = await collectTournamentReward(token);
      await refreshHome(token);
      toast.success(`Collected ${result.gemsCollected} Time Gem${result.gemsCollected === 1 ? "" : "s"}.`);
      setStatus("Tournament reward collected.");
    } catch (collectError) {
      if (collectError instanceof Error && collectError.message === "UNAUTHORIZED") {
        clearUnauthorizedSession();
      } else if (collectError instanceof Error && collectError.message === "TOURNAMENT_FEATURE_LOCKED") {
        setError("Purchase Weekly Tournament in the shop.");
      } else if (collectError instanceof Error && collectError.message === "NO_TOURNAMENT_REWARD_TO_COLLECT") {
        setError("No tournament reward to collect.");
        void refreshHome(token).catch(() => {
          // Ignore refresh errors.
        });
      } else {
        setError(collectError instanceof Error ? collectError.message : "Failed to collect tournament reward");
      }
    } finally {
      setCollectingTournamentReward(false);
    }
  };

  const onStartIdling = async () => {
    setStarting(true);
    setError(null);
    setStatus("Creating your anonymous idle identity...");
    try {
      const auth = await createAnonymousSession();
      localStorage.setItem(tokenStorageKey, auth.token);
      setToken(auth.token);
      await refreshHome(auth.token);
      setStatus("You are doing nothing. Excellent.");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start idling");
      setStatus("Unable to begin idling right now.");
    } finally {
      setStarting(false);
    }
  };

  return {
    starting,
    collecting,
    collectingDailyReward,
    collectingDailyBonus,
    collectingObligation,
    enteringTournament,
    collectingTournamentReward,
    shopPendingQuantity,
    resettingDailyBonus,
    debugPendingAction,
    onCollect,
    onPurchaseUpgrade,
    onUpgradePlayerLevel,
    onDebugAddGems,
    onDebugResetDailyBonus,
    onDebugAddRealTime,
    onDebugAddIdleTime,
    onDebugResetBalances,
    onDebugFinalizeTournament,
    onCollectDailyReward,
    onCollectObligation,
    onCompleteTutorialStep,
    onResetTutorial,
    onCollectDailyBonus,
    onEnterTournament,
    onCollectTournamentReward,
    onStartIdling
  };
}
