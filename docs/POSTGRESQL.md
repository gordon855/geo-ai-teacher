# PostgreSQL 17 operations

The root Compose uses postgres:17-alpine with database/user geoai_demo and a
generated runtime password. The image tag resolved to 17.11 in this acceptance.
The application URL is built inside Compose using host postgres:5432; the database
port is not exposed to Windows. POSTGRES_DB/POSTGRES_USER are fixed by this demo
Compose; changing similarly named .env values alone does not rename a database.

Startup runs scripts/init-demo.mjs, shared lib/mainland/base-schema.json and the
additive scripts in package.json start. Seeds do not reset existing password
hashes. Restart testing actually verified this behavior. Do not set
SKIP_MAINLAND_RUNTIME for a running deployment.

Read-only checks (no password printed):

```powershell
docker compose exec -T postgres pg_isready -U geoai_demo -d geoai_demo
docker compose exec -T postgres psql -U geoai_demo -d geoai_demo -c 'SELECT version();'
docker compose exec -T postgres psql -U geoai_demo -d geoai_demo -c 'SELECT count(*) FROM information_schema.tables WHERE table_schema = $$public$$;'
docker compose logs --tail 100 app
docker compose ps
```

The generated project name scopes demo_postgres and demo_uploads. Retain both,
and keep the encryption key stable. Application records may reference uploaded
PPT bytes, so a database-only backup is not a complete instance backup.

Before a deployment upgrade, capture a consistent database dump, uploaded files
and private configuration while writes are paused. pg_dump and pg_restore should
match the server major version. Restore only into a separate empty instance first,
and verify account access and attachment checksums. Backup/restore disaster recovery
was not exercised in this acceptance; restart persistence is not equivalent to it.

Do not point these scripts at school databases. Root Compose is a fresh demo
deployment, not an in-place production database upgrade recipe.

