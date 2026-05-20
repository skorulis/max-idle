import { useCallback, useRef } from "react";
import { Orbit } from "lucide-react";
import { formatSeconds } from "../formatSeconds";
import { BlackHoleShaderCanvas } from "./BlackHoleShaderCanvas";
import { useBlackHoleFeed } from "./useBlackHoleFeed";
import "./BlackHoleCard.css";

type BlackHoleCardProps = {
  blackholeTime: number;
  onFeedTaps: (taps: number) => Promise<void>;
};

export function BlackHoleCard({ blackholeTime, onFeedTaps }: BlackHoleCardProps) {
  const tapBoostRef = useRef(0);
  const { displayBlackholeTime, timeDilation, registerTap } = useBlackHoleFeed({
    blackholeTime,
    onFeedTaps
  });

  const handleTap = useCallback(() => {
    tapBoostRef.current = 1;
    registerTap();
  }, [registerTap]);

  return (
    <section
      className="card black-hole-card"
      tabIndex={0}
      aria-label="Black hole — tap to brighten and feed time"
      onClick={handleTap}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleTap();
        }
      }}
    >
      <div className="black-hole-card__shader-host" aria-hidden="true">
        <BlackHoleShaderCanvas className="black-hole-card__canvas" tapBoostRef={tapBoostRef} />
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
          handleTap();
        }}
      >
        Feed time
      </button>
    </section>
  );
}
