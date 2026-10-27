#!/usr/bin/env bash
set -euo pipefail
base_url="${1:-http://127.0.0.1:3000}"
health="$(curl --fail --silent --show-error "${base_url}/api/health")"
node -e 'const data=JSON.parse(process.argv[1]); if(!data.ok||data.package_version!=="14.2.0"||data.knowledge_chunks!==813||data.deployment_target!=="aliyun-cn-beijing") process.exit(1); console.log("步骤14.2健康检查通过：14.2.0，813条知识库，北京地域部署目标。")' "${health}"
curl --fail --silent --show-error "${base_url}/legal/privacy" >/dev/null
curl --fail --silent --show-error "${base_url}/teacher/login" >/dev/null
echo "隐私页面与教师登录页检查通过。"
