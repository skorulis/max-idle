import { useCallback, useRef } from "react";
import { Orbit } from "lucide-react";
import { toast } from "../gameToast";
import { formatSeconds } from "../formatSeconds";
import { BlackHoleShaderCanvas } from "./BlackHoleShaderCanvas";
import { useBlackHoleFeed } from "./useBlackHoleFeed";
import "./BlackHoleCard.css";

type BlackHoleCardProps = {
  blackholeTime: number;
  blackholeFeedsRemainingToday: number;
  onFeedTaps: (taps: number) => Promise<void>;
};

export function BlackHoleCard({
  blackholeTime,
  blackholeFeedsRemainingToday,
  onFeedTaps
}: BlackHoleCardProps) {
  const tapBoostRef = useRef(0);
  const { displayBlackholeTime, timeDilation, atDailyLimit, registerTap } =
    useBlackHoleFeed({
      blackholeTime,
      blackholeFeedsRemainingToday,
      onFeedTaps
    });

  const handleTap = useCallback(() => {
    if (atDailyLimit) {
      return;
    }
    tapBoostRef.current = 1;
    registerTap();
  }, [atDailyLimit, registerTap]);

  return (
    <section
      className={"card black-hole-card" + (atDailyLimit ? " black-hole-card--limit-reached" : "")}
      tabIndex={atDailyLimit ? -1 : 0}
      aria-label={
        atDailyLimit
          ? "Black hole — daily feed limit reached"
          : "Black hole — tap to brighten and feed time"
      }
      onClick={handleTap}
      onKeyDown={(event) => {
        if (atDailyLimit) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleTap();
        }
      }}
    >
      <div className="black-hole-card__shader-host" aria-hidden="true">
        <BlackHoleShaderCanvas
          className="black-hole-card__canvas"
          blackholeTime={displayBlackholeTime}
          tapBoostRef={tapBoostRef}
        />
      </div>
      <div className="black-hole-card__content">
        <h2 className="section-title-with-icon">
          <Orbit size={18} aria-hidden="true" />
          Black hole
        </h2>
        <p className="black-hole-card__blackhole-time">Blackhole time: {formatSeconds(displayBlackholeTime)}</p>
        <p className="black-hole-card__dilation">Time dilation: {timeDilation.toFixed(1)}x</p>
      </div>
      <button
        type="button"
        className="black-hole-card__feed-button"
        onClick={(event) => {
          event.stopPropagation();
          if (atDailyLimit) {
            toast.warning("Blackhole feeding is exhausted until tomorrow");
            return;
          }
          handleTap();
        }}
      >
        Feed time
      </button>
    </section>
  );
}
