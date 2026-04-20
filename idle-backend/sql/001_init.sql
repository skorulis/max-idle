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
  total_idle_seconds BIGINT NOT NULL DEFAULT 0,
  spendable_idle_seconds BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
