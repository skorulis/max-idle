import { useCallback, useRef } from "react";
import { Orbit } from "lucide-react";
import { BlackHoleShaderCanvas } from "./BlackHoleShaderCanvas";
import "./BlackHoleCard.css";

export function BlackHoleCard() {
  const tapBoostRef = useRef(0);

  const handleTap = useCallback(() => {
    tapBoostRef.current = 1;
  }, []);

  return (
    <section className="card black-hole-card">
      <div
        className="black-hole-card__shader-host"
        role="button"
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
        <BlackHoleShaderCanvas className="black-hole-card__canvas" tapBoostRef={tapBoostRef} />
      </div>
      <div className="black-hole-card__content">
        <h2 className="section-title-with-icon">
          <Orbit size={18} aria-hidden="true" />
          Black hole
        </h2>
        <p className="black-hole-card__dilation">Time dilation: 1.0x</p>
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
