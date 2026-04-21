CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  username TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique_idx ON users (LOWER(username));

CREATE TABLE IF NOT EXISTS player_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_seconds_collected BIGINT NOT NULL DEFAULT 0,
  spendable_idle_seconds BIGINT NOT NULL DEFAULT 0,
  seconds_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
  current_seconds BIGINT NOT NULL DEFAULT 0,
  current_seconds_last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  auth_user_id TEXT PRIMARY KEY,
  game_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
