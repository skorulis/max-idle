import type { SyncedPlayerState } from "../app/types";
import { formatSeconds } from "../formatSeconds";
import { getMaxIdleCollectionRealtimeSeconds } from "../shop";
import { totalResearchLevelsCompleted } from "@maxidle/shared/research";

type StatsPageProps = {
  playerState: SyncedPlayerState | null;
  effectiveIdleSecondsRate: number;
};

export function StatsPage({ playerState, effectiveIdleSecondsRate }: StatsPageProps) {
  if (!playerState) {
    return (
      <section className="card">
        <h2>Stats</h2>
        <p>Loading player stats...</p>
      </section>
    );
  }

  const maxIdleCollection = getMaxIdleCollectionRealtimeSeconds(playerState.shop, playerState.research);

  const rows = [
    { label: "Maximum idle collection", value: formatSeconds(maxIdleCollection) },
    { label: "Current idle multiplier", value: `${effectiveIdleSecondsRate.toFixed(2)}x` },
    { label: "Total achievements", value: String(playerState.achievementCount) },
    { label: "Total number of collections", value: String(playerState.collectionCount) },
    { label: "Lab levels completed", value: String(totalResearchLevelsCompleted(playerState.research)) }
  ];

  return (
    <section className="card">
      <h2>Stats</h2>
      <table className="stats-table">
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.label}
              className={`stats-table-row${index % 2 === 1 ? " stats-table-row--alt" : ""}`}
            >
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
