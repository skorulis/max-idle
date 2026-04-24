-- If upgrading from a schema with collect_gem_boost_level, merge into shop JSON and drop the column.
UPDATE player_states
SET
  shop = jsonb_set(
    COALESCE(shop, '{}'::jsonb),
    '{collect_gem_time_boost}'::text[],
    to_jsonb(LEAST(5, GREATEST(0, COALESCE(collect_gem_boost_level, 0)::int))),
    true
  )
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE
    table_schema = current_schema()
    AND table_name = 'player_states'
    AND column_name = 'collect_gem_boost_level'
);

ALTER TABLE player_states
DROP COLUMN IF EXISTS collect_gem_boost_level;
