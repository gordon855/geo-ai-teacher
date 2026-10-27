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
[[ "${ICP_APPROVED:-NO}" == "YES" ]] || { echo "已拒绝公开：只有收到ICP备案号并把ICP_APPROVED改为YES后才能执行。" >&2; exit 77; }
[[ -n "${SITE_ICP_NUMBER:-}" ]] || { echo "SITE_ICP_NUMBER不能为空。" >&2; exit 65; }
[[ "${CLASSROOM_PUBLIC_ORIGIN:-}" == "https://${WWW_DOMAIN:-}" ]] || { echo "CLASSROOM_PUBLIC_ORIGIN与WWW_DOMAIN不一致。" >&2; exit 65; }

./scripts/step14-render-nginx.sh http
docker compose --profile public up -d nginx
docker compose --profile public run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  --email "${LETSENCRYPT_EMAIL}" --agree-tos --no-eff-email --keep-until-expiring \
  -d "${ROOT_DOMAIN}" -d "${WWW_DOMAIN}"
./scripts/step14-render-nginx.sh https
docker compose --profile public exec nginx nginx -t
docker compose --profile public exec nginx nginx -s reload
echo "公网HTTPS已启用：https://${WWW_DOMAIN}"

