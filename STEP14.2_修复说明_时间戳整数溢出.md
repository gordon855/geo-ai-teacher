# Step 14.2 修复说明：随机出题时间戳整数溢出

## 现象
章节测试/随机出题时出现：

`value "1786967443119" is out of range for type integer`

## 根因
程序使用 JavaScript `Date.now()` 保存毫秒时间戳（13位整数）。SQLite 的 `INTEGER` 是 64 位，但公网部署使用 PostgreSQL 时，原兼容层把 SQLite `INTEGER` 直接保留为 PostgreSQL `INTEGER`（32 位），最大值只有 2147483647，因此 `quiz_sessions.expires_at` 在比较或写入时发生溢出。

同样风险也存在于 `liveavatar_leases.expires_at` 和 `liveavatar_leases.heartbeat_at`。

## 修复
已修改 `lib/mainland/postgres-d1.mjs`：

1. PostgreSQL 建表转换时，把 `expires_at INTEGER` 和 `heartbeat_at INTEGER` 自动转换成 `BIGINT`。
2. 对已经部署过、表字段已经是 32 位 `INTEGER` 的数据库，应用初始化时自动执行安全迁移：
   - `quiz_sessions.expires_at` -> `BIGINT`
   - `liveavatar_leases.expires_at` -> `BIGINT`
   - `liveavatar_leases.heartbeat_at` -> `BIGINT`
3. 不改变学生、班级、成绩、题库等已有数据。

## 部署后验证
重新构建并启动后：

1. 登录学生端。
2. 打开章节测试/随机出题。
3. 选择 Unit、题量和测试重点。
4. 点击“开始随机出题”。
5. 不应再出现 `out of range for type integer`。

如果需要直接检查 PostgreSQL 字段类型，可执行：

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'quiz_sessions' AND column_name = 'expires_at')
   OR (table_name = 'liveavatar_leases' AND column_name IN ('expires_at','heartbeat_at'));
```

修复后应显示 `bigint`。
