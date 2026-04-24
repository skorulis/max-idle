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
  completed_achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  shop JSONB NOT NULL DEFAULT '{"seconds_multiplier": 0, "restraint": false, "luck": false}'::jsonb,
  seconds_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_seconds BIGINT NOT NULL DEFAULT 0,
  current_seconds_last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_daily_reward_collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE player_states
ADD COLUMN IF NOT EXISTS upgrades_purchased BIGINT NOT NULL DEFAULT 0;

ALTER TABLE player_states
ADD COLUMN IF NOT EXISTS shop JSONB NOT NULL DEFAULT '{"seconds_multiplier": 0, "restraint": false, "luck": false}'::jsonb;

ALTER TABLE player_states
ADD COLUMN IF NOT EXISTS seconds_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE player_states
ALTER COLUMN shop SET DEFAULT '{"seconds_multiplier": 0, "restraint": false, "luck": false}'::jsonb;

ALTER TABLE player_states
ALTER COLUMN seconds_multiplier SET DEFAULT 0;

UPDATE player_states
SET shop = '{"seconds_multiplier": 0, "restraint": false, "luck": false}'::jsonb
WHERE COALESCE(shop->>'seconds_multiplier', '') = '';

UPDATE player_states
SET shop = '{"seconds_multiplier": 0}'::jsonb
WHERE COALESCE(shop->>'seconds_multiplier', '') = '';

CREATE TABLE IF NOT EXISTS auth_identities (
  auth_user_id TEXT PRIMARY KEY,
  game_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_identities_game_user_id_idx ON auth_identities (game_user_id);
