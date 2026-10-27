import pg from "pg";

const { Pool, types } = pg;

// PostgreSQL returns BIGINT and NUMERIC as strings by default. The classroom
// schema only stores bounded counts and scores, so parsing them as numbers keeps
// the existing Step 12 API response shapes unchanged.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

function replaceQuestionMarks(sql) {
  let parameter = 0;
  let quote = "";
  let output = "";
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      output += character;
      if (character === quote) {
        if (sql[index + 1] === quote) {
          output += sql[index + 1];
          index += 1;
        } else {
          quote = "";
        }
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
      continue;
    }
    if (character === "?") {
      parameter += 1;
      output += `$${parameter}`;
      continue;
    }
    output += character;
  }
  return output;
}

export function convertSqliteQueryToPostgres(sql) {
  const normalized = String(sql)
    .replace(
      /([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*\?\s+COLLATE\s+NOCASE/giu,
      "LOWER($1)=LOWER(?)",
    )
    .replace(/\s+COLLATE\s+NOCASE/giu, "")
    .replace(/\bREAL\b/gu, "NUMERIC")
    // SQLite INTEGER is a signed 64-bit value, while PostgreSQL INTEGER is
    // only 32-bit. These columns store JavaScript millisecond timestamps
    // (Date.now()), so they must be BIGINT on PostgreSQL.
    .replace(/\b(expires_at|heartbeat_at)\s+INTEGER\b/giu, "$1 BIGINT");
  return replaceQuestionMarks(normalized);
}

function resultFromQuery(result) {
  return {
    success: true,
    results: result.rows || [],
    meta: { changes: Number(result.rowCount || 0), command: result.command },
  };
}

class PostgresD1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = convertSqliteQueryToPostgres(sql);
    this.values = values;
  }

  bind(...values) {
    return new PostgresD1Statement(this.database, this.sql, values);
  }

  async execute(client = this.database.pool) {
    return client.query(this.sql, this.values);
  }

  async first(columnName) {
    const result = await this.execute();
    const row = result.rows?.[0] ?? null;
    if (!row || !columnName) return row;
    return row[columnName] ?? null;
  }

  async all() {
    return resultFromQuery(await this.execute());
  }

  async run() {
    return resultFromQuery(await this.execute());
  }
}

class PostgresD1Database {
  constructor(pool) {
    this.pool = pool;
    this.millisecondTimestampMigration = null;
  }

  async ensureMillisecondTimestampColumns() {
    if (!this.millisecondTimestampMigration) {
      this.millisecondTimestampMigration = (async () => {
        const migrations = [
          "ALTER TABLE IF EXISTS liveavatar_leases ALTER COLUMN expires_at TYPE BIGINT USING expires_at::bigint",
          "ALTER TABLE IF EXISTS liveavatar_leases ALTER COLUMN heartbeat_at TYPE BIGINT USING heartbeat_at::bigint",
          "ALTER TABLE IF EXISTS quiz_sessions ALTER COLUMN expires_at TYPE BIGINT USING expires_at::bigint",
        ];
        for (const sql of migrations) {
          try {
            await this.pool.query(sql);
          } catch (error) {
            // During the first schema batch a table may not exist yet. The
            // migration is retried after the schema batch completes.
            if (error?.code !== "42P01" && error?.code !== "42703") throw error;
          }
        }
      })().catch((error) => {
        this.millisecondTimestampMigration = null;
        throw error;
      });
    }
    await this.millisecondTimestampMigration;
  }

  prepare(sql) {
    return new PostgresD1Statement(this, sql);
  }

  async batch(statements) {
    if (!statements.length) return [];
    const needsTimestampMigration = statements.some((statement) =>
      statement instanceof PostgresD1Statement
      && /CREATE TABLE IF NOT EXISTS\s+(quiz_sessions|liveavatar_leases)\b/iu.test(statement.sql),
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        if (!(statement instanceof PostgresD1Statement) || statement.database !== this) {
          throw new Error("数据库批处理包含无效语句。");
        }
        results.push(resultFromQuery(await statement.execute(client)));
      }
      await client.query("COMMIT");
      if (needsTimestampMigration) {
        // Existing Step 14 PostgreSQL installations may already have these
        // columns as 32-bit INTEGER. Upgrade them automatically after the schema
        // batch so Date.now() values (13 digits) no longer overflow.
        this.millisecondTimestampMigration = null;
        await this.ensureMillisecondTimestampColumns();
      }
      return results;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async healthcheck() {
    await this.pool.query("SELECT 1 AS ready");
    await this.ensureMillisecondTimestampColumns();
  }

  async close() {
    await this.pool.end();
  }
}

export function createPostgresD1Database(options = {}) {
  const connectionString = String(options.connectionString || process.env.DATABASE_URL || "").trim();
  if (!connectionString) throw new Error("DATABASE_URL尚未配置。");
  const pool = new Pool({
    connectionString,
    max: Number(options.max || process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "surveying-ai-teacher-step15",
  });
  pool.on("error", (error) => console.error("[step15-postgres]", error.message));
  return new PostgresD1Database(pool);
}
