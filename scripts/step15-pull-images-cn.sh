#!/usr/bin/env bash
set -euo pipefail

pull_and_tag() {
  local source="$1"
  local target="$2"
  docker pull "${source}"
  docker tag "${source}" "${target}"
  echo "镜像已准备：${target}"
}

# 仅在ECS直连Docker Hub超时时使用。镜像内容仍由Docker摘要校验。
pull_and_tag m.daocloud.io/docker.io/library/node:22-bookworm-slim node:22-bookworm-slim
pull_and_tag m.daocloud.io/docker.io/library/postgres:17-alpine postgres:17-alpine
pull_and_tag m.daocloud.io/docker.io/library/nginx:1.27-alpine nginx:1.27-alpine
pull_and_tag m.daocloud.io/docker.io/certbot/certbot:v4.0.0 certbot/certbot:v4.0.0
