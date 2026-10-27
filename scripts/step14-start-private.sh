#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
[[ -f .env ]] || { echo "缺少.env，请先执行：cp config/step14.env.example .env" >&2; exit 66; }
docker run --rm -v "${project_dir}:/app:ro" -w /app node:22-bookworm-slim node scripts/step14-preflight.mjs .env
docker compose up -d --build postgres app
docker compose ps
echo "私有测试已启动，仅服务器本机127.0.0.1:3000可访问。ICP备案通过前不要启动public配置。"
echo "从个人电脑测试可使用SSH隧道：ssh -L 3000:127.0.0.1:3000 <服务器登录用户>@<ECS公网IP>"

