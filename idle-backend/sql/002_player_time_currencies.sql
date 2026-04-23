-- Migrate older player_states column names and ensure all time currency columns exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'player_states'
      AND column_name = 'total_seconds_collected'
  ) THEN
    ALTER TABLE player_states RENAME COLUMN total_seconds_collected TO idle_time_total;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'player_states'
      AND column_name = 'spendable_idle_seconds'
  ) THEN
    ALTER TABLE player_states RENAME COLUMN spendable_idle_seconds TO idle_time_available;
  END IF;
END $$;

ALTER TABLE player_states ADD COLUMN IF NOT EXISTS real_time_total BIGINT NOT NULL DEFAULT 0;
ALTER TABLE player_states ADD COLUMN IF NOT EXISTS real_time_available BIGINT NOT NULL DEFAULT 0;
ALTER TABLE player_states ADD COLUMN IF NOT EXISTS time_gems_total BIGINT NOT NULL DEFAULT 0;
ALTER TABLE player_states ADD COLUMN IF NOT EXISTS time_gems_available BIGINT NOT NULL DEFAULT 0;
ALTER TABLE player_states ADD COLUMN IF NOT EXISTS last_daily_reward_collected_at TIMESTAMPTZ;
