import pg from "pg";

const { Client } = pg;
const connectionString = String(process.env.DATABASE_URL || "").trim();

// Local SQLite/dev mode does not need a PostgreSQL migration.
if (!connectionString || !/^postgres(?:ql)?:\/\//iu.test(connectionString)) {
  console.log("[step14-migrate] DATABASE_URL 不是 PostgreSQL，跳过毫秒时间戳迁移。");
  process.exit(0);
}

const client = new Client({ connectionString, application_name: "surveying-ai-teacher-step14-migrate" });

const targets = [
  ["quiz_sessions", "expires_at"],
  ["liveavatar_leases", "expires_at"],
  ["liveavatar_leases", "heartbeat_at"],
];

try {
  await client.connect();
  await client.query("BEGIN");

  for (const [table, column] of targets) {
    const exists = await client.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
        LIMIT 1`,
      [table, column],
    );
    if (!exists.rowCount) continue;

    await client.query(
      `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE BIGINT USING ${column}::bigint`,
    );
  }

  await client.query("COMMIT");

  const verification = await client.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE (table_name = 'quiz_sessions' AND column_name = 'expires_at')
         OR (table_name = 'liveavatar_leases' AND column_name IN ('expires_at','heartbeat_at'))
      ORDER BY table_name, column_name`,
  );

  const wrong = verification.rows.filter((row) => row.data_type !== "bigint");
  if (wrong.length) {
    throw new Error(`时间戳字段迁移后仍不是 BIGINT：${JSON.stringify(wrong)}`);
  }

  console.log("[step14-migrate] PostgreSQL 毫秒时间戳字段检查完成。", verification.rows);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("[step14-migrate] 数据库迁移失败：", error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
