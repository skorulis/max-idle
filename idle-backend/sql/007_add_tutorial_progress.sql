ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS tutorial_progress TEXT NOT NULL DEFAULT '';
