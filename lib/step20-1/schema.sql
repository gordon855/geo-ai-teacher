CREATE TABLE IF NOT EXISTS v201_policy_migrations(version text PRIMARY KEY,installed_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM v201_policy_migrations WHERE version='20.1-resubmit') THEN
  UPDATE v20_assessments a SET max_attempts=GREATEST(2,COALESCE((SELECT MAX(ordinal) FROM v20_attempts t WHERE t.assessment_id=a.id),0))
  WHERE NOT practice AND status='published';
  INSERT INTO v201_policy_migrations(version) VALUES('20.1-resubmit');
END IF;
END $$;
