import { Gift } from "lucide-react";
import { formatSeconds } from "../formatSeconds";
import type { DailyBonusHistoryItem, SyncedPlayerState } from "../app/types";
import { formatDailyBonusDate, getDailyBonusDescription, isDoubleGemsDailyReward } from "../app/dailyBonus";

type DailyBonusPageProps = {
  playerState: SyncedPlayerState | null;
  collectingDailyReward: boolean;
  collectingDailyBonus: boolean;
  dailyRewardAvailable: boolean;
  dailyRewardSecondsUntilAvailable: number;
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
  dailyBonusHistory,
  dailyBonusHistoryLoading,
  onCollectDailyReward,
  onCollectDailyBonus
}: DailyBonusPageProps) {
  const dailyBonus = playerState?.dailyBonus ?? null;

  return (
    <>
      <h2>Daily Bonus</h2>
      <div className="panel">
        <p className="shop-currency-title">
          <Gift size={16} aria-hidden="true" />
          Daily Gem Reward
        </p>
        {dailyRewardAvailable ? (
          <>
            <p className="shop-currency-value">
              Ready to collect ({isDoubleGemsDailyReward(dailyBonus) ? "+2 Time Gems" : "+1 Time Gem"})
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
      <div className="panel">
        <p className="shop-currency-title">
          <Gift size={16} aria-hidden="true" />
          Daily Bonus
        </p>
        <p className="shop-currency-value">{getDailyBonusDescription(dailyBonus)}</p>
        {dailyBonus?.isCollectable ? (
          <button
            className="collect"
            onClick={() => void onCollectDailyBonus()}
            disabled={collectingDailyBonus || dailyBonus.isClaimed}
          >
            {dailyBonus.isClaimed
              ? "Daily bonus claimed"
              : collectingDailyBonus
                ? "Collecting daily bonus..."
                : "Collect daily bonus"}
          </button>
        ) : (
          <p className="subtle">Applies automatically today.</p>
        )}
      </div>

      <h3 className="leaderboard-header">
        Last 30 Daily Bonuses
      </h3>
      {dailyBonusHistoryLoading ? <p>Loading daily bonus history...</p> : null}
      {!dailyBonusHistoryLoading && dailyBonusHistory.length === 0 ? <p className="subtle">No daily bonus history yet.</p> : null}
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
  );
}
