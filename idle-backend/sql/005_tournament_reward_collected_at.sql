ALTER TABLE tournament_entries
ADD COLUMN IF NOT EXISTS reward_collected_at TIMESTAMPTZ;

UPDATE tournament_entries
SET reward_collected_at = finalized_at
WHERE finalized_at IS NOT NULL
  AND reward_collected_at IS NULL;
