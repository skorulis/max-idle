import { Gift } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatSeconds } from "../formatSeconds";
import type { DailyBonusHistoryItem, SyncedPlayerState } from "../app/types";
import { formatDailyBonusDate, getDailyBonusDescription, isDailyRewardDoubledToday } from "../app/dailyBonus";
import { isDailyBonusFeatureUnlocked } from "../shop";

type DailyBonusPageProps = {
  playerState: SyncedPlayerState | null;
  collectingDailyReward: boolean;
  collectingDailyBonus: boolean;
  dailyRewardAvailable: boolean;
  dailyRewardSecondsUntilAvailable: number;
  dailyBonusSecondsUntilUtcReset: number;
  dailyBonusHistory: DailyBonusHistoryItem[];
  dailyBonusHistoryLoading: boolean;
  onCollectDailyReward: () => Promise<void>;
  onCollectDailyBonus: () => Promise<void>;
};

export function DailyBonusPage({
  playerState,
  collectingDailyReward,
  collectingDailyBonus,
  dailyRewardAvailable,
  dailyRewardSecondsUntilAvailable,
  dailyBonusSecondsUntilUtcReset,
  dailyBonusHistory,
  dailyBonusHistoryLoading,
  onCollectDailyReward,
  onCollectDailyBonus
}: DailyBonusPageProps) {
  const navigate = useNavigate();
  const dailyBonus = playerState?.dailyBonus ?? null;
  const dailyBonusUnlocked = playerState ? isDailyBonusFeatureUnlocked(playerState.shop) : false;

  return (
    <section className="card">
      <h2>Daily Bonus</h2>
      <div className="panel">
        <p className="shop-currency-title">
          <Gift size={16} aria-hidden="true" />
          Daily Gem Reward
        </p>
        {dailyRewardAvailable ? (
          <>
            <p className="shop-currency-value">
              Ready to collect ({isDailyRewardDoubledToday(dailyBonus) ? "+2 Time Gems" : "+1 Time Gem"})
            </p>
            <button className="collect" onClick={() => void onCollectDailyReward()} disabled={collectingDailyReward}>
              {collectingDailyReward ? "Collecting daily reward..." : "Collect daily reward"}
            </button>
          </>
        ) : (
          <>
            <p className="shop-currency-value">+1 Time Gem</p>
            <p className="subtle">Resets in {formatSeconds(dailyRewardSecondsUntilAvailable)}</p>
          </>
        )}
      </div>
      {!dailyBonusUnlocked ? (
        <div className="panel">
          <p className="shop-currency-title">
            <Gift size={16} aria-hidden="true" />
            Daily Bonus
          </p>
          <p className="shop-currency-value">{getDailyBonusDescription(dailyBonus)}</p>
          {dailyBonus ? (
            <p className="subtle">
              When unlocked, activation costs {formatSeconds(dailyBonus.activationCostIdleSeconds)} idle time.
            </p>
          ) : null}
          <p className="subtle">
            Purchase Daily Bonus for 1 Time Gem in the shop (Time Gems tab) to unlock activation and history.
          </p>
          <button type="button" className="secondary" onClick={() => navigate("/shop")}>
            Open shop
          </button>
        </div>
      ) : (
        <>
          <div className="panel">
            <p className="shop-currency-title">
              <Gift size={16} aria-hidden="true" />
              Daily Bonus
            </p>
            <p className="shop-currency-value">{getDailyBonusDescription(dailyBonus)}</p>
            {dailyBonus ? (
              <>
                <p className="subtle">
                  {dailyBonus.isClaimed
                    ? `Resets in ${formatSeconds(dailyBonusSecondsUntilUtcReset)}`
                    : `Activation costs ${formatSeconds(dailyBonus.activationCostIdleSeconds)} idle time.`}
                </p>
                <button
                  className="collect"
                  onClick={() => void onCollectDailyBonus()}
                  disabled={
                    collectingDailyBonus ||
                    dailyBonus.isClaimed ||
                    (playerState?.idleTime.available ?? 0) < dailyBonus.activationCostIdleSeconds
                  }
                >
                  {dailyBonus.isClaimed
                    ? "Daily bonus activated"
                    : collectingDailyBonus
                      ? "Activating daily bonus..."
                      : "Activate daily bonus"}
                </button>
              </>
            ) : null}
          </div>

          <h3 className="leaderboard-header">
            Last 30 Daily Bonuses
          </h3>
          {dailyBonusHistoryLoading ? <p>Loading daily bonus history...</p> : null}
          {!dailyBonusHistoryLoading && dailyBonusHistory.length === 0 ? (
            <p className="subtle">No daily bonus history yet.</p>
          ) : null}
          {!dailyBonusHistoryLoading && dailyBonusHistory.length > 0 ? (
            <div className="achievements-list">
              {dailyBonusHistory.map((historyItem) => (
                <div key={`${historyItem.date}-${historyItem.type}`} className="achievement-row">
                  <div className="achievement-copy">
                    <p className="achievement-name">{formatDailyBonusDate(historyItem.date)}</p>
                    <p className="achievement-description">{getDailyBonusDescription(historyItem)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
