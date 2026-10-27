#!/usr/bin/env bash
set -Eeuo pipefail
base="${1:-http://127.0.0.1:3000}"
curl -fsS --max-time 20 "${base%/}/api/health" | python3 -c 'import json,sys;p=json.load(sys.stdin);assert p.get("ok") is True,p;assert p.get("security",{}).get("schema_version")==19,p;assert p.get("package_version")=="19.2.0",p;assert p.get("builtin_knowledge_chunks",p.get("knowledge_chunks"))==813,p;print("版本19.2.0正常；内置813知识块；上传知识块",p.get("uploaded_knowledge_chunks"),"，上传来源",p.get("uploaded_knowledge_sources"))'
for path in / /student/login /teacher/login /reports; do
 code="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code}' "${base%/}${path}")"
 [[ "$code" == 200 ]] || { echo "页面检查失败 ${path}: HTTP ${code}"; exit 1; }
done
echo '基础页面检查通过；请继续登录验收原有数据和三维地图。'
