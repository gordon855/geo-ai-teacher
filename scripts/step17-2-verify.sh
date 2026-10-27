#!/usr/bin/env bash
set -euo pipefail

health="$(curl -fsS --max-time 15 http://127.0.0.1:3000/api/health)"
[[ "${health}" == *'"ok":true'* ]] || { echo "第17.2版健康检查失败：应用未就绪。" >&2; exit 1; }
[[ "${health}" == *'"package_version":"17.2.0"'* ]] || { echo "第17.2版健康检查失败：应用版本不是17.2.0。" >&2; exit 1; }
[[ "${health}" == *'"builtin_knowledge_chunks":813'* ]] || { echo "第17.2版健康检查失败：原813条内置知识库不完整。" >&2; exit 1; }
[[ "${health}" == *'"deployment_target":"aliyun-cn-beijing"'* ]] || { echo "第17.2版健康检查失败：部署目标不是阿里云北京。" >&2; exit 1; }
echo "第17.2版健康检查通过：17.2.0，813条内置知识库完整，教师自建知识库继续使用原数据卷。"

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
