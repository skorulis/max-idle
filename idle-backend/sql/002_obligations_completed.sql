-- Add obligations completion map for existing databases.

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS obligations_completed JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'player_states'
      AND c.conname = 'player_states_obligations_completed_check'
  ) THEN
    ALTER TABLE player_states ADD CONSTRAINT player_states_obligations_completed_check CHECK (
      jsonb_typeof(obligations_completed) = 'object'
      AND NOT jsonb_path_exists(
        obligations_completed,
        '$.* ? (@.type() != "boolean")'
      )
    );
  END IF;
END $$;
