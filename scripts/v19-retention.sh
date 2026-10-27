#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
project="${1:?compose project}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || exit 1
new="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
mkdir -p "$new/backups"
exec 8>"$new/backups/security-retention.lock";flock -n 8 || exit 0
nginx="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=nginx)"
db="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=postgres)"
[[ -n "$nginx" && -n "$db" ]] || { echo '未找到日志或数据库容器，留存维护失败。';exit 1; }
# Compress only files at least two days old; keep 210+ days, longer than six calendar months.
docker exec "$nginx" sh -c 'find /var/log/v19 -type f -name "access-*.log" -mtime +2 -exec gzip {} \;'
docker exec "$nginx" sh -c 'find /var/log/v19 -type f -name "access-*.log.gz" -mtime +210 -delete'
docker exec -i "$db" sh -c 'psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DELETE FROM v19_challenges WHERE expires_at < now()-interval '1 day';
DELETE FROM v19_limits WHERE started_at < now()-interval '2 days';
-- Audit events and content evidence are not automatically purged. Access logs retain seven calendar months.
DELETE FROM v19_requests WHERE created_at < now()-interval '7 months';
SQL
used="$(df -P "$new" | awk 'NR==2 {gsub(/%/,"",$5);print $5}')"
if ((used>=85));then printf '磁盘使用率%s%%，请扩容或下载备份；不要删除不足六个月日志。\n' "$used" | tee "$new/backups/SECURITY_DISK_ALERT.txt";exit 1;fi
printf '%s 磁盘使用率%s%%，日志维护完成。\n' "$(date -u +%FT%TZ)" "$used"
