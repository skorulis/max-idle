ALTER TABLE player_states
ADD COLUMN IF NOT EXISTS daily_bonuses_collected_count BIGINT NOT NULL DEFAULT 0;
