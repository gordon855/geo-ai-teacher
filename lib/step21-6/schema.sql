CREATE TABLE IF NOT EXISTS v216_messages(
 id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
 content TEXT NOT NULL CHECK(char_length(content) BETWEEN 1 AND 2000),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','handled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS v216_messages_class_created ON v216_messages(class_id,created_at DESC,id);
