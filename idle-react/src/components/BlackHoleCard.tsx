import { Orbit } from "lucide-react";
import { BlackHoleShaderCanvas } from "./BlackHoleShaderCanvas";
import "./BlackHoleCard.css";

export function BlackHoleCard() {
  return (
    <section className="card black-hole-card">
      <div className="black-hole-card__shader-host">
        <BlackHoleShaderCanvas className="black-hole-card__canvas" />
      </div>
      <div className="black-hole-card__content">
        <h2 className="section-title-with-icon">
          <Orbit size={18} aria-hidden="true" />
          Black hole
        </h2>
      </div>
    </section>
  );
}
