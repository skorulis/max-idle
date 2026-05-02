CREATE TABLE IF NOT EXISTS survey_answers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  survey_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS survey_answers_user_survey_unique_idx
  ON survey_answers (user_id, survey_id);

CREATE INDEX IF NOT EXISTS survey_answers_survey_id_idx
  ON survey_answers (survey_id);
