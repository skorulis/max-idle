ALTER TABLE player_states
ALTER COLUMN shop SET DEFAULT '{"seconds_multiplier": 0, "restraint": 0, "idle_hoarder": 0, "luck": 0, "collect_gem_time_boost": 0}'::jsonb;

UPDATE player_states
SET shop = jsonb_set(COALESCE(shop, '{}'::jsonb), '{idle_hoarder}', '0'::jsonb, true)
WHERE COALESCE(shop->>'idle_hoarder', '') = '';
