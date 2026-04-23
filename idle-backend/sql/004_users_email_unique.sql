CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL;
