#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
docker compose --profile public run --rm certbot renew --webroot --webroot-path /var/www/certbot
docker compose --profile public exec nginx nginx -s reload

