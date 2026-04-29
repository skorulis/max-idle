import { Bug, CircleHelp, CircleUserRound, Hourglass, Medal, ShoppingCart, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import GameIcon from "../GameIcon";

export type AppNavProps = {
  isAuthenticated: boolean;
  hasUnseenAchievements: boolean;
  showDebugFeatures: boolean;
};

export function AppNav({ isAuthenticated, hasUnseenAchievements, showDebugFeatures }: AppNavProps) {
  const navigate = useNavigate();

  return (
    <header className="page-nav">
      <button type="button" className="link" onClick={() => navigate("/")}>
        <GameIcon icon={Hourglass} />
      </button>
      <button type="button" className="link" onClick={() => navigate("/leaderboard")}>
        <GameIcon icon={Medal} />
      </button>
      {isAuthenticated ? (
        <>
          <button type="button" className="link" onClick={() => navigate("/shop")}>
            <GameIcon icon={ShoppingCart} />
          </button>
          <button type="button" className="link" onClick={() => navigate("/achievements")}>
            <span className="nav-icon-with-dot">
              <GameIcon icon={Star} />
              {hasUnseenAchievements ? (
                <span className="nav-icon-dot" aria-label="New achievement unlocked" role="status" />
              ) : null}
            </span>
          </button>
          <button type="button" className="link" onClick={() => navigate("/account")}>
            <GameIcon icon={CircleUserRound} />
          </button>
        </>
      ) : null}
      <button type="button" className="link" onClick={() => navigate("/help")}>
        <GameIcon icon={CircleHelp} />
      </button>
      {showDebugFeatures ? (
        <button type="button" className="link" aria-label="Debug" onClick={() => navigate("/debug")}>
          <GameIcon icon={Bug} />
        </button>
      ) : null}
    </header>
  );
}
