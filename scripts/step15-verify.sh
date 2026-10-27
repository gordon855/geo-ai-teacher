#!/usr/bin/env bash
set -euo pipefail

health="$(curl -fsS http://127.0.0.1:3000/api/health)"
[[ "${health}" == *'"ok":true'* ]] || { echo "版本15健康检查失败：应用未就绪。" >&2; exit 1; }
[[ "${health}" == *'"package_version":"15.0.0"'* ]] || { echo "版本15健康检查失败：应用版本不是15.0.0。" >&2; exit 1; }
[[ "${health}" == *'"knowledge_chunks":813'* ]] || { echo "版本15健康检查失败：固定知识库不是813条。" >&2; exit 1; }
[[ "${health}" == *'"deployment_target":"aliyun-cn-beijing"'* ]] || { echo "版本15健康检查失败：部署目标不是阿里云北京。" >&2; exit 1; }
echo "版本15健康检查通过：15.0.0，813条知识库，北京地域部署目标。"

if [[ "${1:-}" == "--public" ]]; then
  for url in \
    "https://localhost/" \
    "https://localhost/student/login" \
    "https://localhost/teacher/login"; do
    status="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 20 "${url}")"
    [[ "${status}" == "200" ]] || { echo "公网验收失败：${url} 返回${status}" >&2; exit 69; }
    echo "公网入口正常：${url}"
  done
  root_target="$(curl -sSI --max-time 20 https://localhost/ | tr -d '\r' | awk 'tolower($1)=="location:" {print $2; exit}')"
  [[ "${root_target}" == https://localhost/* ]] || { echo "根域名没有跳转到www：${root_target}" >&2; exit 69; }
  echo "根域名跳转正常：https://localhost → ${root_target}"
fi
