#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
[[ -f .env ]] || { echo "缺少.env，请先执行：cp config/step15.env.example .env" >&2; exit 66; }
docker run --rm -v "${project_dir}:/app:ro" -w /app node:22-bookworm-slim node scripts/step15-preflight.mjs .env

# 私有测试通过SSH隧道访问localhost，显式设置来源以通过登录防伪校验。
CLASSROOM_PUBLIC_ORIGIN=http://localhost:3000 docker compose up -d --build postgres app
docker compose ps
echo "版本15私有测试已启动，仅服务器本机127.0.0.1:3000可访问。"
echo "个人电脑可使用SSH隧道：ssh -L 3000:127.0.0.1:3000 <服务器登录用户>@<ECS公网IP>"
echo "浏览器打开：http://localhost:3000。正式上线脚本会自动恢复https://localhost来源。"
