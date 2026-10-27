#!/usr/bin/env bash
# GEOAI_OSS_LEGACY_DISABLED: historical deployment source retained for review.
echo "This legacy in-place deployment script is disabled in the OSS edition. Use docs/INSTALL.md with a fresh demo volume." >&2
exit 2
set -euo pipefail
umask 077

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
old_dir="${1:-/opt/sxie-ai-teacher-14.2/surveying-ai-teacher-step14.2}"

if [[ ! -f .env ]]; then
  [[ -f "${old_dir}/.env" ]] || {
    echo "没有找到第14.2版.env：${old_dir}/.env" >&2
    echo "请把第14.2版项目目录作为参数，例如：./scripts/step15-upgrade-from-14.2.sh /opt/旧项目目录" >&2
    exit 66
  }
  install -m 600 "${old_dir}/.env" .env
  echo "已安全复制第14.2版.env；数据库密码、加密密钥、OSS和AI配置保持不变。"
fi

set -a
source .env
set +a
[[ "${COMPOSE_PROJECT_NAME:-}" == "geoai_demo_legacy" ]] || {
  echo "COMPOSE_PROJECT_NAME必须保持geoai_demo_legacy，否则无法复用第14.2版数据卷。" >&2
  exit 65
}

docker run --rm -v "${project_dir}:/app:ro" -w /app node:22-bookworm-slim node scripts/step15-preflight.mjs .env

mkdir -p backups
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_final="backups/pre-v15-${backup_stamp}.dump"
backup_temp="${backup_final}.tmp"
trap 'rm -f "${backup_temp}"' EXIT

if [[ -z "$(docker compose ps -q postgres)" ]]; then
  echo "正在启动原PostgreSQL数据卷以创建升级前备份……"
  docker compose up -d postgres
fi
for _ in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then break; fi
  sleep 2
done
docker compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  pg_dump --format=custom --no-owner --no-acl -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > "${backup_temp}"
[[ -s "${backup_temp}" ]] || { echo "数据库备份为空，已停止升级。" >&2; exit 74; }
mv "${backup_temp}" "${backup_final}"
chmod 600 "${backup_final}"
trap - EXIT
echo "升级前数据库备份已完成：${backup_final}"

# 暂时使用localhost来源，便于先通过SSH隧道验收；公开脚本会恢复正式HTTPS来源。
CLASSROOM_PUBLIC_ORIGIN=http://localhost:3000 docker compose up -d --build --force-recreate postgres app
for _ in $(seq 1 90); do
  health="$(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  if [[ "${health}" == *'"package_version":"15.0.0"'* ]]; then
    echo "版本15升级完成：原账号、成绩、PPT、作业、OSS和知识库继续使用。"
    echo "先通过http://localhost:3000验收，再填写备案号并执行./scripts/step15-enable-public.sh。"
    exit 0
  fi
  sleep 2
done
echo "容器已启动，但180秒内未通过健康检查。请执行：docker compose logs --tail=200 app" >&2
exit 70
