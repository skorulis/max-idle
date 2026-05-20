-- Daily feed tap counter for the black hole (resets each UTC day).

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS blackhole_feeds_today INTEGER NOT NULL DEFAULT 0;

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS blackhole_feed_day_start TIMESTAMPTZ;
