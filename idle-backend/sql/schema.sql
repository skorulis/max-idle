-- Max Idle PostgreSQL schema.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  username TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique_idx ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS player_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idle_time_total BIGINT NOT NULL DEFAULT 0,
  idle_time_available BIGINT NOT NULL DEFAULT 0,
  real_time_total BIGINT NOT NULL DEFAULT 0,
  real_time_available BIGINT NOT NULL DEFAULT 0,
  time_gems_total BIGINT NOT NULL DEFAULT 0,
  time_gems_available BIGINT NOT NULL DEFAULT 0,
  upgrades_purchased BIGINT NOT NULL DEFAULT 0,
  achievement_count BIGINT NOT NULL DEFAULT 0,
  has_unseen_achievements BOOLEAN NOT NULL DEFAULT FALSE,
  achievement_levels JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(achievement_levels) = 'array'
    AND NOT jsonb_path_exists(
      achievement_levels,
      '$[*] ? (@.type() != "object" || !exists(@.id) || @.id.type() != "string" || !exists(@.level) || @.level.type() != "number" || @.level < 1 || !exists(@.grantedAt) || @.grantedAt.type() != "string")'
    )
  ),
  shop JSONB NOT NULL DEFAULT '{"seconds_multiplier": 0, "restraint": 0, "idle_hoarder": 0, "luck": 0, "collect_gem_time_boost": 0}'::jsonb,
  seconds_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_seconds BIGINT NOT NULL DEFAULT 0,
  current_seconds_last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_daily_reward_collected_at TIMESTAMPTZ,
  last_daily_bonus_claimed_at TIMESTAMPTZ,
  last_daily_bonus_claimed_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_bonuses (
  id BIGSERIAL PRIMARY KEY,
  bonus_date_utc TIMESTAMPTZ NOT NULL,
  bonus_type TEXT NOT NULL,
  bonus_value INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_bonuses_bonus_date_utc_unique UNIQUE (bonus_date_utc),
  CONSTRAINT daily_bonuses_bonus_type_check CHECK (
    bonus_type IN (
      'collect_idle_percent',
      'collect_real_percent',
      'double_gems_daily_reward',
      'free_real_time_hours',
      'free_idle_time_hours'
    )
  ),
  CONSTRAINT daily_bonuses_bonus_value_check CHECK (
    (bonus_type = 'collect_idle_percent' AND bonus_value BETWEEN 10 AND 50)
    OR (bonus_type = 'collect_real_percent' AND bonus_value BETWEEN 10 AND 50)
    OR (bonus_type = 'double_gems_daily_reward' AND bonus_value = 2)
    OR (bonus_type = 'free_real_time_hours' AND bonus_value BETWEEN 1 AND 5)
    OR (bonus_type = 'free_idle_time_hours' AND bonus_value BETWEEN 6 AND 24)
  )
);

CREATE TABLE IF NOT EXISTS auth_identities (
  auth_user_id TEXT PRIMARY KEY,
  game_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_identities_game_user_id_idx ON auth_identities (game_user_id);

CREATE TABLE IF NOT EXISTS player_collection_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_date TIMESTAMPTZ NOT NULL,
  real_time BIGINT NOT NULL,
  idle_time BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS player_collection_history_user_id_idx ON player_collection_history (user_id);

CREATE TABLE IF NOT EXISTS tournaments (
  id BIGSERIAL PRIMARY KEY,
  draw_at_utc TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tournaments_single_active_idx
ON tournaments (is_active)
WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS tournament_entries (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  final_rank BIGINT,
  time_score_seconds BIGINT,
  gems_awarded INTEGER,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_entries_tournament_user_unique_idx
ON tournament_entries (tournament_id, user_id);

CREATE INDEX IF NOT EXISTS tournament_entries_tournament_score_idx
ON tournament_entries (tournament_id, time_score_seconds DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  last_daily_reward_notified_day_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_last_daily_reward_day_idx
  ON push_subscriptions (last_daily_reward_notified_day_start);
