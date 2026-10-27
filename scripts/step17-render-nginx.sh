#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
[[ -f .env ]] || { echo "缺少.env，请先从第15版复制原.env。" >&2; exit 66; }
set -a
source .env
set +a
[[ "${ROOT_DOMAIN:-}" == "localhost" ]] || { echo "ROOT_DOMAIN必须是localhost。" >&2; exit 65; }
[[ "${WWW_DOMAIN:-}" == "localhost" ]] || { echo "WWW_DOMAIN必须是localhost。" >&2; exit 65; }

mode="${1:-http}"
template="deploy/nginx/${mode}.conf.template"
[[ -f "${template}" ]] || { echo "未知Nginx配置模式：${mode}" >&2; exit 64; }
temporary="deploy/nginx/active.conf.tmp"
sed -e "s/__ROOT_DOMAIN__/${ROOT_DOMAIN}/g" -e "s/__WWW_DOMAIN__/${WWW_DOMAIN}/g" "${template}" > "${temporary}"
cp "${temporary}" deploy/nginx/active.conf
rm -f "${temporary}"
echo "版本17.2已生成${mode^^}入口配置：${ROOT_DOMAIN} / ${WWW_DOMAIN}"
