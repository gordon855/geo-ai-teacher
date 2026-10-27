#!/usr/bin/env bash
set -Eeuo pipefail
project="${1:?Compose project name}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || exit 1
exec 8>"/run/lock/surveying-obe-$project.lock";flock -n 8 || exit 0
app="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=app)"
[[ -n "$app" ]] || exit 0
version="$(docker exec "$app" node -p 'require("./package.json").version')"
[[ "$version" == '21.1.0' ]] || exit 0
docker exec "$app" node scripts/v20-3-tick.mjs
