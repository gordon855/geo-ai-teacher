#!/usr/bin/env bash
# GEOAI_OSS_LEGACY_DISABLED: historical deployment source retained for review.
echo "This legacy in-place deployment script is disabled in the OSS edition. Use docs/INSTALL.md with a fresh demo volume." >&2
exit 2
set -euo pipefail
umask 077

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
old_dir="${1:-/opt/surveying-ai-teacher-step15}"

if [[ ! -f .env ]]; then
  [[ -f "${old_dir}/.env" ]] || {
    echo "没有找到第15版.env：${old_dir}/.env" >&2
    echo "请把第15版目录作为参数，例如：./scripts/step17-upgrade-from-15.sh /opt/你的第15版目录" >&2
    exit 66
  }
  install -m 600 "${old_dir}/.env" .env
  echo "已复制第15版.env；数据库密码、加密密钥、OSS、域名和AI配置保持不变。"
fi

set -a
source .env
set +a
[[ "${COMPOSE_PROJECT_NAME:-}" == "geoai_demo_legacy" ]] || {
  echo "COMPOSE_PROJECT_NAME必须保持geoai_demo_legacy，否则不能复用第15版数据卷。" >&2
  exit 65
}

docker run --rm -v "${project_dir}:/app:ro" -w /app node:22-bookworm-slim node scripts/step17-preflight.mjs .env

mkdir -p backups
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_final="backups/pre-v17-${backup_stamp}.dump"
backup_temp="${backup_final}.tmp"
trap 'rm -f "${backup_temp}"' EXIT

if [[ -z "$(docker compose ps -q postgres)" ]]; then
  echo "正在启动原PostgreSQL数据卷以创建升级前备份……"
  docker compose up -d postgres
fi
for _ in $(seq 1 60); do
  docker compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1 && break
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

old_container="$(docker compose ps -q app)"
rollback_tag="${COMPOSE_PROJECT_NAME}-app:pre-v17-${backup_stamp}"
if [[ -n "${old_container}" ]]; then
  old_image="$(docker inspect --format '{{.Image}}' "${old_container}")"
  docker tag "${old_image}" "${rollback_tag}"
  echo "第15版应用镜像已保留为：${rollback_tag}"
fi

echo "正在构建第17版；构建期间第15版继续运行。"
docker compose build app
docker compose up -d --no-deps --force-recreate app

ready="NO"
for _ in $(seq 1 90); do
  health="$(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  if [[ "${health}" == *'"package_version":"17.2.0"'* ]]; then ready="YES"; break; fi
  sleep 2
done

if [[ "${ready}" != "YES" ]]; then
  echo "第17.2版180秒内未通过健康检查，准备自动恢复第15版应用镜像。" >&2
  if docker image inspect "${rollback_tag}" >/dev/null 2>&1; then
    docker tag "${rollback_tag}" "${COMPOSE_PROJECT_NAME}-app:latest"
    docker compose up -d --no-deps --force-recreate app
    echo "已恢复第15版应用镜像；数据库备份位于${backup_final}。" >&2
  fi
  docker compose logs --tail=200 app >&2
  exit 70
fi

./scripts/step17-verify.sh

if docker compose --profile public run --rm --no-deps --entrypoint sh certbot -c "test -s /etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem && test -s /etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem"; then
  ./scripts/step17-render-nginx.sh https
  docker compose --profile public up -d --no-deps --force-recreate nginx
  ./scripts/step17-verify.sh --public
  echo "版本17.2无损升级完成：https://${WWW_DOMAIN}/teacher"
else
  ./scripts/step17-render-nginx.sh http
  docker compose --profile public up -d --no-deps --force-recreate nginx
  echo "版本17.2应用已升级，但当前证书卷中没有可用证书。请确认80/443端口后执行：./scripts/step17-2-enable-public.sh"
fi

echo "原学生账号、成绩、作业、PPT、OSS文件和813条内置知识库均继续使用。"
echo "数据库备份：${backup_final}"
