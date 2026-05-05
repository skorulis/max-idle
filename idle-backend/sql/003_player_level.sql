-- Player level (progression); new rows default to 1.

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
