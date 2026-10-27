#!/usr/bin/env bash
set -euo pipefail
umask 077
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
[[ -f .env ]] || { echo "缺少.env。" >&2; exit 66; }
set -a
source .env
set +a
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="backups/surveying-teacher-${stamp}.dump"
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --no-owner > "${backup}"
[[ -s "${backup}" ]] || { echo "备份失败：文件为空。" >&2; exit 74; }
chmod 600 "${backup}"
docker compose exec -T app node scripts/upload-backup.mjs "/app/${backup}"
find backups -maxdepth 1 -type f -name 'surveying-teacher-*.dump' -mtime +30 -delete
echo "备份完成：${backup}"

