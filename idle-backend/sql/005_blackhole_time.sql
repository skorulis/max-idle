-- Time invested in the black hole (seconds).

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS blackhole_time BIGINT NOT NULL DEFAULT 0;
