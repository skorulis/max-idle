ALTER TABLE auth_identities
DROP CONSTRAINT IF EXISTS auth_identities_game_user_id_key;

CREATE INDEX IF NOT EXISTS auth_identities_game_user_id_idx ON auth_identities (game_user_id);
