ALTER TABLE player_states
RENAME COLUMN total_idle_seconds TO total_seconds_collected;

ALTER TABLE player_states
ADD COLUMN IF NOT EXISTS current_seconds BIGINT NOT NULL DEFAULT 0;

ALTER TABLE player_states
ADD COLUMN IF NOT EXISTS current_seconds_last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE player_states
SET
  current_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_collected_at))::BIGINT),
  current_seconds_last_updated = NOW()
WHERE current_seconds = 0;
