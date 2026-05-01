-- Remove per-type bonus_value ranges; application code owns valid values.
ALTER TABLE daily_bonuses DROP CONSTRAINT IF EXISTS daily_bonuses_bonus_value_check;
