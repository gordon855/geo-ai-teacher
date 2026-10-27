CREATE TABLE IF NOT EXISTS v20_assessments(id text PRIMARY KEY,class_id text NOT NULL REFERENCES classes(id),title text NOT NULL,units jsonb NOT NULL,round int NOT NULL CHECK(round BETWEEN 1 AND 3),bank jsonb NOT NULL,max_attempts int NOT NULL CHECK(max_attempts BETWEEN 1 AND 5),practice boolean NOT NULL DEFAULT false,status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','closed')),created_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS v20_attempts(id text PRIMARY KEY,assessment_id text NOT NULL REFERENCES v20_assessments(id),student_user_id text NOT NULL REFERENCES users(id),ordinal int NOT NULL,questions jsonb NOT NULL,answers jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','grading','graded','review')),score numeric CHECK(score BETWEEN 0 AND 100),feedback jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz,graded_at timestamptz,lease_at timestamptz,lease_token text,grading_error text NOT NULL DEFAULT '',UNIQUE(assessment_id,student_user_id,ordinal));
CREATE UNIQUE INDEX IF NOT EXISTS v20_one_draft ON v20_attempts(assessment_id,student_user_id) WHERE status='draft';
CREATE INDEX IF NOT EXISTS v20_attempt_student ON v20_attempts(student_user_id,assessment_id);
CREATE TABLE IF NOT EXISTS v20_submission_history(source_kind text NOT NULL,source_id text NOT NULL,submission_time text NOT NULL,payload jsonb NOT NULL,saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_kind,source_id,submission_time));
CREATE OR REPLACE FUNCTION v20_record_submission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO v20_submission_history VALUES(TG_TABLE_NAME,NEW.id,NEW.submitted_at::text,to_jsonb(NEW),now()) ON CONFLICT(source_kind,source_id,submission_time) DO UPDATE SET payload=EXCLUDED.payload,saved_at=now();RETURN NEW;END $$;
DO $$ BEGIN
IF to_regclass('public.assignments') IS NOT NULL THEN ALTER TABLE assignments ADD COLUMN IF NOT EXISTS task_module text NOT NULL DEFAULT 'homework';END IF;
IF to_regclass('public.assignment_submissions') IS NOT NULL THEN
DROP TRIGGER IF EXISTS v20_keep_submission ON assignment_submissions;
CREATE TRIGGER v20_keep_submission AFTER INSERT OR UPDATE ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION v20_record_submission();
INSERT INTO v20_submission_history SELECT 'assignment_submissions',id,submitted_at::text,to_jsonb(s),now() FROM assignment_submissions s ON CONFLICT DO NOTHING;END IF;
IF to_regclass('public.terrain_submissions') IS NOT NULL THEN
DROP TRIGGER IF EXISTS v20_keep_submission ON terrain_submissions;
CREATE TRIGGER v20_keep_submission AFTER INSERT OR UPDATE ON terrain_submissions FOR EACH ROW EXECUTE FUNCTION v20_record_submission();
INSERT INTO v20_submission_history SELECT 'terrain_submissions',id,submitted_at::text,to_jsonb(s),now() FROM terrain_submissions s ON CONFLICT DO NOTHING;END IF;END $$;
