import { formatSeconds } from "../formatSeconds";
import type { PlayerProfileResponse } from "../app/types";

type PlayerPageProps = {
  publicPlayerLoading: boolean;
  publicPlayerProfile: PlayerProfileResponse["player"] | null;
  hasError: boolean;
};

export function PlayerPage({ publicPlayerLoading, publicPlayerProfile, hasError }: PlayerPageProps) {
  return (
    <>
      <h2>{publicPlayerProfile?.username ?? "Player"}</h2>
      {publicPlayerLoading ? <p>Loading player profile...</p> : null}
      {!publicPlayerLoading && publicPlayerProfile ? (
        <>
          <p>
            <span>Account age:</span> {formatSeconds(publicPlayerProfile.accountAgeSeconds)}
          </p>
          <p>
            <span>Current idle time:</span> {formatSeconds(publicPlayerProfile.currentIdleSeconds)}
          </p>
          <p>
            <span>Collected idle time:</span> {formatSeconds(publicPlayerProfile.collectedIdleSeconds)}
          </p>
          <p>
            <span>Achievements earned:</span> {publicPlayerProfile.achievementCount}
          </p>
        </>
      ) : null}
      {!publicPlayerLoading && !publicPlayerProfile && !hasError ? <p>Player not found.</p> : null}
    </>
  );
}
