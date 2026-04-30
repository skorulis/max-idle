-- Apply once on existing databases that still have `completed_achievements`.
-- Ensure players have been backfilled into `achievement_levels` before dropping (e.g. by deploying
-- a release that writes only `achievement_levels` and letting active users collect/sync).

ALTER TABLE player_states DROP COLUMN IF EXISTS completed_achievements;
