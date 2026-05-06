-- Player level (progression). Legacy: default was 1; new installs use 0 (see 004).

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
