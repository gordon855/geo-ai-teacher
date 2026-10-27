#!/usr/bin/env bash
set -Eeuo pipefail
base="${1:-http://127.0.0.1:3000}"
curl -fsS --max-time 20 "${base%/}/api/health" | python3 -c 'import json,sys;p=json.load(sys.stdin);assert p.get("ok") is True,p;assert p.get("security",{}).get("schema_version")==19,p;assert p.get("assessment_schema_version")==20,p;assert p.get("remediation_schema_version")==202,p;assert p.get("retention_schema_version")==203,p;assert p.get("workstation_schema_version")==21,p;assert p.get("avatar_trial_schema_version")==211,p;assert p.get("package_version")=="21.1.0",p;assert p.get("builtin_knowledge_chunks",p.get("knowledge_chunks"))==813,p;print("版本21.1.0正常；内置813知识块；上传知识块",p.get("uploaded_knowledge_chunks"),"，上传来源",p.get("uploaded_knowledge_sources"))'
for path in / /student/login /teacher/login /reports; do
 code="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code}' "${base%/}${path}")"
 [[ "$code" == 200 ]] || { echo "页面检查失败 ${path}: HTTP ${code}"; exit 1; }
done
echo '基础页面检查通过；请继续登录验收原有数据和三维地图。'

app="$(docker ps -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME:-geoai_demo_legacy}" --filter label=com.docker.compose.service=app)"
[[ -n "$app" ]] || { echo "未找到主应用容器";exit 1; }
docker exec "$app" node scripts/v20-map-diagnose.mjs "$base"
