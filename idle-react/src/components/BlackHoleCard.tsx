import { useCallback, useMemo, useRef } from "react";
import { getBlackHoleTimeDilation } from "@maxidle/shared/blackHole";
import { Orbit } from "lucide-react";
import { formatSeconds } from "../formatSeconds";
import { BlackHoleShaderCanvas } from "./BlackHoleShaderCanvas";
import "./BlackHoleCard.css";

type BlackHoleCardProps = {
  blackholeTime: number;
};

export function BlackHoleCard({ blackholeTime }: BlackHoleCardProps) {
  const tapBoostRef = useRef(0);
  const timeDilation = useMemo(() => getBlackHoleTimeDilation(blackholeTime), [blackholeTime]);

  const handleTap = useCallback(() => {
    tapBoostRef.current = 1;
  }, []);

  return (
    <section
      className="card black-hole-card"
      tabIndex={0}
      aria-label="Black hole — tap to brighten"
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
        <p className="black-hole-card__blackhole-time">Blackhole time: {formatSeconds(blackholeTime)}</p>
        <p className="black-hole-card__dilation">Time dilation: {timeDilation.toFixed(1)}x</p>
      </div>
      <button
        type="button"
        className="black-hole-card__feed-button"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        Feed time
      </button>
    </section>
  );
}
