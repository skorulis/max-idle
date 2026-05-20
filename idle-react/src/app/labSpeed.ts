import { parseLabSpeedMultiplier } from "@maxidle/shared/labSpeed";

export const labSpeedMultiplier = parseLabSpeedMultiplier(
  import.meta.env.VITE_LAB_SPEED_MULTIPLIER
);
