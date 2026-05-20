-- Research progress and active lab slots.

ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS research JSONB NOT NULL DEFAULT '{"levels":{}}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'player_states'
      AND c.conname = 'player_states_research_check'
  ) THEN
    ALTER TABLE player_states ADD CONSTRAINT player_states_research_check CHECK (
      jsonb_typeof(research) = 'object'
    );
  END IF;
END $$;
