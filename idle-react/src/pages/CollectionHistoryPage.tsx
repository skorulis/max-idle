import { formatSeconds } from "../formatSeconds";
import type { CollectionHistoryItem } from "../app/types";

type CollectionHistoryPageProps = {
  history: CollectionHistoryItem[];
  loading: boolean;
};

function formatCollectionDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function CollectionHistoryPage({ history, loading }: CollectionHistoryPageProps) {
  return (
    <>
      <h2>Collection History</h2>
      <h3 className="leaderboard-header">Last 100 collections</h3>
      {loading ? <p>Loading collection history...</p> : null}
      {!loading && history.length === 0 ? <p className="subtle">No collections yet.</p> : null}
      {!loading && history.length > 0 ? (
        <div className="achievements-list">
          {history.map((item) => {
            const multiplier = item.realTime > 0 ? item.idleTime / item.realTime : 0;
            return (
              <div key={item.id} className="achievement-row">
                <div className="achievement-copy">
                  <p className="achievement-name">{formatCollectionDate(item.collectionDate)}</p>
                  <p className="achievement-description">
                    Real {formatSeconds(item.realTime)} → Idle {formatSeconds(item.idleTime)} ({multiplier.toFixed(2)}x)
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
