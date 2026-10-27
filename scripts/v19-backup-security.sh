#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
project="${1:?compose project}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || exit 1
new="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
dest="$new/backups/security-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dest"
db="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=postgres)"
nginx="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=nginx)"
[[ -n "$db" && -n "$nginx" ]] || exit 1
docker exec "$db" sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$dest/database.dump"
docker exec -i "$db" pg_restore --list < "$dest/database.dump" > "$dest/database-contents.txt"
# Historical daily logs are closed. Current-day file is a best-effort snapshot; originals remain mounted.
docker exec "$nginx" tar -czf - -C /var/log/v19 . > "$dest/nginx-access-logs.tar.gz"
[[ -s "$dest/database.dump" && -s "$dest/nginx-access-logs.tar.gz" ]]
echo "安全日志与数据库备份：$dest。请下载到受控备份位置；本机副本不能防止整盘故障。"
