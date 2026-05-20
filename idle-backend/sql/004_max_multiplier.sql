-- Peak effective idle seconds rate reached (see getEffectiveIdleSecondsRate).

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS max_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0.0;
