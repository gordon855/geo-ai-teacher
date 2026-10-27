import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { convertSqliteQueryToPostgres } from "../lib/mainland/postgres-d1.mjs";
import { createStorageBucket } from "../lib/mainland/storage.mjs";

test("converts D1 placeholders, case-insensitive comparisons and numeric columns for PostgreSQL", () => {
  const query = convertSqliteQueryToPostgres(
    "SELECT '?' AS literal FROM users WHERE username=? COLLATE NOCASE AND id IN (?,?)",
  );
  assert.equal(query, "SELECT '?' AS literal FROM users WHERE LOWER(username)=LOWER($1) AND id IN ($2,$3)");
  const schema = convertSqliteQueryToPostgres("CREATE TABLE scores (value REAL, username TEXT UNIQUE COLLATE NOCASE)");
  assert.equal(schema, "CREATE TABLE scores (value NUMERIC, username TEXT UNIQUE)");
});

test("local private storage adapter preserves PPT bytes and blocks path traversal", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "step14-storage-"));
  try {
    const bucket = createStorageBucket({ LOCAL_STORAGE_PATH: directory });
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 13, 42]);
    await bucket.put("presentations/test.pptx", bytes);
    assert.equal((await bucket.head("presentations/test.pptx"))?.size, bytes.length);
    const loaded = new Uint8Array(await (await bucket.get("presentations/test.pptx")).arrayBuffer());
    assert.deepEqual([...loaded], [...bytes]);
    assert.throws(() => bucket.objectPath("../../outside"), /路径无效/u);
    await bucket.delete("presentations/test.pptx");
    assert.equal(await bucket.get("presentations/test.pptx"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

