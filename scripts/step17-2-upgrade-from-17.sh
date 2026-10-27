#!/usr/bin/env bash
# GEOAI_OSS_LEGACY_DISABLED: historical deployment source retained for review.
echo "This legacy in-place deployment script is disabled in the OSS edition. Use docs/INSTALL.md with a fresh demo volume." >&2
exit 2
set -euo pipefail
umask 077

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
old_dir="${1:-/opt/surveying-ai-teacher-step17}"

[[ -d "${old_dir}" ]] || {
  echo "没有找到当前第17版目录：${old_dir}" >&2
  echo "请把实际第17版目录作为参数，例如：./scripts/step17-2-upgrade-from-17.sh /opt/surveying-ai-teacher-step17" >&2
  exit 66
}

if [[ ! -f .env ]]; then
  [[ -f "${old_dir}/.env" ]] || {
    echo "没有找到第17版配置文件：${old_dir}/.env" >&2
    exit 66
  }
  install -m 600 "${old_dir}/.env" .env
  echo "已复制第17版.env；数据库密码、加密密钥、OSS、域名、备案和AI配置保持不变。"
fi

set -a
source .env
set +a
[[ "${COMPOSE_PROJECT_NAME:-}" == "geoai_demo_legacy" ]] || {
  echo "COMPOSE_PROJECT_NAME必须保持geoai_demo_legacy，否则不能复用线上数据卷。" >&2
  exit 65
}

docker run --rm -v "${project_dir}:/app:ro" -w /app node:22-bookworm-slim node scripts/step17-2-preflight.mjs .env

before_health="$(curl -fsS --max-time 15 http://127.0.0.1:3000/api/health 2>/dev/null || true)"
echo "替换前健康信息：${before_health:-未读取到；脚本将继续检查Docker服务}"

mkdir -p backups
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_final="backups/pre-v17.2-${backup_stamp}.dump"
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
[[ -s "${backup_temp}" ]] || { echo "数据库备份为空，已停止替换；当前第17版仍在运行。" >&2; exit 74; }
mv "${backup_temp}" "${backup_final}"
chmod 600 "${backup_final}"
trap - EXIT
echo "升级前数据库备份已完成：${project_dir}/${backup_final}"

old_container="$(docker compose ps -q app)"
[[ -n "${old_container}" ]] || { echo "没有找到正在运行的app容器，已停止替换。" >&2; exit 69; }
old_image="$(docker inspect --format '{{.Image}}' "${old_container}")"
rollback_tag="${COMPOSE_PROJECT_NAME}-app:pre-v17.2-${backup_stamp}"
docker tag "${old_image}" "${rollback_tag}"
echo "当前第17版应用镜像已保留为：${rollback_tag}"

rollback_app() {
  echo "第17.2版没有通过检查，正在自动恢复替换前的第17版应用镜像……" >&2
  docker tag "${rollback_tag}" "${COMPOSE_PROJECT_NAME}-app:latest"
  docker compose up -d --no-deps --force-recreate app
  echo "已恢复替换前应用；数据库备份位于${project_dir}/${backup_final}。" >&2
}

echo "正在构建第17.2版；构建期间当前第17版继续提供服务。"
docker compose build app
echo "构建完成，开始切换app容器。通常只会有短暂重启时间。"
docker compose up -d --no-deps --force-recreate app

ready="NO"
for _ in $(seq 1 90); do
  health="$(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  if [[ "${health}" == *'"package_version":"17.2.0"'* ]]; then ready="YES"; break; fi
  sleep 2
done

if [[ "${ready}" != "YES" ]]; then
  rollback_app
  docker compose logs --tail=200 app >&2
  exit 70
fi

if ! ./scripts/step17-2-verify.sh; then
  rollback_app
  exit 70
fi

if docker compose --profile public run --rm --no-deps --entrypoint sh certbot -c "test -s /etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem && test -s /etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem"; then
  ./scripts/step17-render-nginx.sh https
  docker compose --profile public up -d --no-deps --force-recreate nginx
  ./scripts/step17-2-verify.sh --public
  echo "第17.2版无损替换完成：https://${WWW_DOMAIN}/teacher"
else
  ./scripts/step17-render-nginx.sh http
  docker compose --profile public up -d --no-deps --force-recreate nginx
  echo "第17.2版应用已完成替换，但证书卷中没有可用证书。确认80/443端口后执行：./scripts/step17-2-enable-public.sh"
fi

echo "原学生账号、密码状态、成绩、作业、PPT、OSS文件、3D实训记录、教师上传资料和813条内置知识库均继续使用。"
echo "数据库备份：${project_dir}/${backup_final}"
echo "回滚镜像：${rollback_tag}"
