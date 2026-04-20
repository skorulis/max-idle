ALTER TABLE users
ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE users
SET username = CONCAT('anonymous-', SUBSTRING(id::TEXT FROM 1 FOR 8))
WHERE username IS NULL;

ALTER TABLE users
ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique_idx ON users (LOWER(username));
