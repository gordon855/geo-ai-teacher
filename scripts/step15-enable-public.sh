#!/usr/bin/env bash
# GEOAI_OSS_LEGACY_DISABLED: historical deployment source retained for review.
echo "This legacy in-place deployment script is disabled in the OSS edition. Use docs/INSTALL.md with a fresh demo volume." >&2
exit 2
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
[[ -f .env ]] || { echo "缺少.env。" >&2; exit 66; }
set -a
source .env
set +a

[[ "${ICP_APPROVED:-NO}" == "YES" ]] || { echo "已拒绝公开：请在收到ICP备案号后把ICP_APPROVED改为YES。" >&2; exit 77; }
[[ -n "${SITE_ICP_NUMBER:-}" ]] || { echo "SITE_ICP_NUMBER不能为空，必须填写完整ICP备案号。" >&2; exit 65; }
[[ "${SITE_ICP_NUMBER}" != *"请填写"* && "${SITE_ICP_NUMBER}" != *"CHANGE_ME"* ]] || { echo "SITE_ICP_NUMBER仍是示例值，请填写管局批准的完整备案号。" >&2; exit 65; }
if [[ "${SITE_ICP_NUMBER}" != *-* ]]; then
  echo "提醒：山西网站页脚通常应填写带网站序号的网站备案号（例如末尾含-1），请勿误填只有主体编号的备案号。" >&2
fi
[[ "${ROOT_DOMAIN:-}" == "localhost" ]] || { echo "ROOT_DOMAIN必须是localhost。" >&2; exit 65; }
[[ "${WWW_DOMAIN:-}" == "localhost" ]] || { echo "WWW_DOMAIN必须是localhost。" >&2; exit 65; }
[[ "${CLASSROOM_PUBLIC_ORIGIN:-}" == "https://localhost" ]] || { echo "CLASSROOM_PUBLIC_ORIGIN必须是https://localhost。" >&2; exit 65; }

docker run --rm -v "${project_dir}:/app:ro" -w /app node:22-bookworm-slim node scripts/step15-preflight.mjs .env

# 去掉私有测试时的localhost临时环境，恢复.env中的正式来源。
docker compose up -d --no-deps --force-recreate app
for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://127.0.0.1:3000/api/health >/dev/null

./scripts/step15-render-nginx.sh http
docker compose --profile public up -d nginx
docker compose --profile public run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  --email "${LETSENCRYPT_EMAIL}" --agree-tos --no-eff-email --keep-until-expiring \
  -d "${ROOT_DOMAIN}" -d "${WWW_DOMAIN}"
./scripts/step15-render-nginx.sh https
docker compose --profile public exec nginx nginx -t
docker compose --profile public exec nginx nginx -s reload
echo "版本15公网HTTPS已启用：https://${WWW_DOMAIN}"
echo "学生端：https://${WWW_DOMAIN}/student/login"
echo "教师端：https://${WWW_DOMAIN}/teacher/login"
echo "AI教师问答：https://${WWW_DOMAIN}/"
