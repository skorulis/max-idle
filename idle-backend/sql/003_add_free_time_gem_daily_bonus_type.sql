ALTER TABLE daily_bonuses DROP CONSTRAINT IF EXISTS daily_bonuses_bonus_type_check;

ALTER TABLE daily_bonuses
ADD CONSTRAINT daily_bonuses_bonus_type_check CHECK (
  bonus_type IN (
    'collect_idle_percent',
    'collect_real_percent',
    'double_gems_daily_reward',
    'free_time_gem',
    'free_real_time_hours',
    'free_idle_time_hours'
  )
);
