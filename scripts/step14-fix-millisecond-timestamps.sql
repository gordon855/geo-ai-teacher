-- Optional manual migration for an already-running Step 14.2 PostgreSQL database.
-- The application now performs the same migration automatically during schema initialization.
ALTER TABLE IF EXISTS liveavatar_leases
  ALTER COLUMN expires_at TYPE BIGINT USING expires_at::bigint;
ALTER TABLE IF EXISTS liveavatar_leases
  ALTER COLUMN heartbeat_at TYPE BIGINT USING heartbeat_at::bigint;
ALTER TABLE IF EXISTS quiz_sessions
  ALTER COLUMN expires_at TYPE BIGINT USING expires_at::bigint;
