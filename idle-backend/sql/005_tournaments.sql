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
