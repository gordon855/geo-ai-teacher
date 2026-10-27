# Step 14.2 第二次修复：PostgreSQL INTEGER 溢出

## 为什么上一版仍可能报错

上一版把 PostgreSQL 兼容层改为自动迁移 BIGINT，但如果服务器仍在使用旧镜像，或者应用启动期间没有触发兼容层迁移，数据库卷中的旧表仍可能保持 `INTEGER`。这时章节测试在执行：

```sql
DELETE FROM quiz_sessions WHERE expires_at <= ?
```

参数 `Date.now()` 是 13 位毫秒时间戳，PostgreSQL 会按旧字段的 32 位 `INTEGER` 推断参数类型，因此在 INSERT 之前就会直接报：

`value "1786968959532" is out of range for type integer`

## 本版做了三重修复

1. `lib/step8a/database.ts` 中相关建表字段直接改为 `BIGINT`。
2. 保留 `lib/mainland/postgres-d1.mjs` 的自动迁移逻辑。
3. 新增 `scripts/step14-migrate-postgres.mjs`，生产容器每次启动 Next.js 前都会先执行数据库迁移并核验字段类型。

生产启动命令现在是：

```bash
node scripts/step14-migrate-postgres.mjs && next start --hostname 0.0.0.0 --port 3000
```

如果迁移失败，应用不会带着错误数据库结构继续启动。

## 服务器升级

在新的项目目录中：

```bash
docker compose down
docker compose up -d --build postgres app
docker compose logs --tail=120 app
```

日志中应出现：

`[step14-migrate] PostgreSQL 毫秒时间戳字段检查完成。`

然后可直接核验数据库：

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE (table_name='quiz_sessions' AND column_name='expires_at') OR (table_name='liveavatar_leases' AND column_name IN ('expires_at','heartbeat_at')) ORDER BY table_name,column_name;"
```

`quiz_sessions.expires_at` 必须显示 `bigint`。
