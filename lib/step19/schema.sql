CREATE TABLE IF NOT EXISTS v19_schema (version int PRIMARY KEY, installed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS v19_requests (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), actor_id text, account text, method text NOT NULL, path text NOT NULL, source_ip text, source_port text, target_ip text, target_port text, user_agent text, event text NOT NULL DEFAULT 'request_received');
CREATE INDEX IF NOT EXISTS v19_requests_time ON v19_requests(created_at);
CREATE TABLE IF NOT EXISTS v19_events (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), actor_id text NOT NULL, action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL, request_id text);
CREATE INDEX IF NOT EXISTS v19_events_time ON v19_events(created_at);
CREATE TABLE IF NOT EXISTS v19_barrage (id text PRIMARY KEY, class_id text NOT NULL, class_name text NOT NULL, sender_id text NOT NULL, sender_name text NOT NULL, content text NOT NULL, status text NOT NULL CHECK(status IN ('pending','flagged','approved','rejected','hidden','legacy')), flags jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, display_until timestamptz, reviewer_id text, reason text NOT NULL DEFAULT '', request_id text);
CREATE INDEX IF NOT EXISTS v19_barrage_class ON v19_barrage(class_id,status,created_at);
CREATE TABLE IF NOT EXISTS v19_mutes (class_id text NOT NULL, sender_id text NOT NULL, until_at timestamptz NOT NULL, reason text NOT NULL, actor_id text NOT NULL, PRIMARY KEY(class_id,sender_id));
CREATE TABLE IF NOT EXISTS v19_settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS v19_reports (id text PRIMARY KEY, receipt_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), actor_id text, category text NOT NULL, target text NOT NULL, content text NOT NULL, contact text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewing','resolved','dismissed')), response text NOT NULL DEFAULT '', handler_id text, request_id text);
CREATE TABLE IF NOT EXISTS v19_challenges (id text PRIMARY KEY, answer_hash text NOT NULL, expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS v19_limits (key text PRIMARY KEY, started_at timestamptz NOT NULL, count integer NOT NULL);
-- Evidence snapshots intentionally have no cascading foreign keys to student accounts.
CREATE OR REPLACE FUNCTION v19_protect_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'cannot truncate retained evidence'; END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'append-only evidence'; END IF;
 IF OLD.created_at > now()-interval '6 months' THEN RAISE EXCEPTION 'minimum six calendar months retention'; END IF;
 RETURN OLD;
END;$$;
DROP TRIGGER IF EXISTS v19_requests_protect ON v19_requests;
CREATE TRIGGER v19_requests_protect BEFORE UPDATE OR DELETE ON v19_requests FOR EACH ROW EXECUTE FUNCTION v19_protect_evidence();
DROP TRIGGER IF EXISTS v19_events_protect ON v19_events;
CREATE TRIGGER v19_events_protect BEFORE UPDATE OR DELETE ON v19_events FOR EACH ROW EXECUTE FUNCTION v19_protect_evidence();
INSERT INTO v19_schema(version) VALUES(19) ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS v19_requests_no_truncate ON v19_requests;
CREATE TRIGGER v19_requests_no_truncate BEFORE TRUNCATE ON v19_requests FOR EACH STATEMENT EXECUTE FUNCTION v19_protect_evidence();
DROP TRIGGER IF EXISTS v19_events_no_truncate ON v19_events;
CREATE TRIGGER v19_events_no_truncate BEFORE TRUNCATE ON v19_events FOR EACH STATEMENT EXECUTE FUNCTION v19_protect_evidence();
