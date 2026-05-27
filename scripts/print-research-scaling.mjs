#!/usr/bin/env node
/**
 * Prints idle cost, timer duration, and effect for each research level transition.
 * Uses @maxidle/shared (build shared first: npm run build --prefix shared).
 */
import { RESEARCH_ITEMS } from "../shared/dist/researchItems.js";
import {
  formatResearchBonusLabel,
  formatResearchEffectProgression,
  getResearchDurationSeconds,
  getResearchTimeCost
} from "../shared/dist/research.js";
import { formatSeconds } from "../shared/dist/formatSeconds.js";

function fmtSeconds(seconds) {
  return formatSeconds(seconds, 2, "floor");
}

function padEnd(str, width) {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

for (const def of RESEARCH_ITEMS) {
  console.log(`\n${def.name}`);
  console.log(
    `  max level ${def.maximumLevel}  |  growth ×${def.growthFactor}  |  base idle ${fmtSeconds(def.baseTimeCost)}  |  base duration ${fmtSeconds(def.baseDuration)}`
  );
  console.log("");
  console.log("  Level   Effect (now → after)          Idle cost    Duration");
  console.log("  -----   ------------------------          ---------    --------");

  for (let level = 0; level < def.maximumLevel; level++) {
    const levelLabel = `${level}→${level + 1}`;
    const effect = formatResearchEffectProgression(def, level);
    const idleCost = fmtSeconds(getResearchTimeCost(def, level));
    const duration = fmtSeconds(getResearchDurationSeconds(def, level));
    console.log(
      `  ${padEnd(levelLabel, 7)} ${padEnd(effect, 28)} ${padEnd(idleCost, 12)} ${duration}`
    );
  }

  console.log(
    `\n  At max (level ${def.maximumLevel}): ${formatResearchBonusLabel(def, def.maximumLevel)}`
  );
}

console.log("");
