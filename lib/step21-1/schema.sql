CREATE TABLE IF NOT EXISTS v211_avatar_trials(id text PRIMARY KEY,teacher_id text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS v211_avatar_trials_teacher ON v211_avatar_trials(teacher_id,created_at);
