#!/usr/bin/env bash
set -Eeuo pipefail
app="${1:-geoai_demo_legacy-app-1}"
docker inspect "$app" --format 'project={{index .Config.Labels "com.docker.compose.project"}} directory={{index .Config.Labels "com.docker.compose.project.working_dir"}}{{range .Mounts}} volume={{.Name}}:{{.Destination}}{{end}}'
version="$(docker exec "$app" node -p 'require("./package.json").version')"
printf 'actual_version=%s\n' "$version"
[[ "$version" == '20.3.0' ]] || { echo '本升级包要求实际运行版本为20.3.0；停止核对。';exit 1; }
curl -fsS --max-time 10 http://127.0.0.1:3000/api/health | python3 -c 'import json,sys;p=json.load(sys.stdin);assert p.get("ok") and p.get("package_version")=="20.3.0";print("线上基础版本核验通过")'
