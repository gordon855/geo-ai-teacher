#!/usr/bin/env bash
set -Eeuo pipefail
new="${1:?release directory}";project="${2:?Compose project name}"
[[ "$new" =~ ^/[A-Za-z0-9_./-]+$ && "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || exit 1
[[ -f "$new/scripts/v20-3-reconcile.sh" ]] || exit 1
mkdir -p "$new/backups"
printf 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n* * * * * root /bin/bash %s/scripts/v20-3-reconcile.sh %s >> %s/backups/obe-stage2.log 2>&1\n' "$new" "$project" "$new" > "/etc/cron.d/surveying-v203-$project"
chmod 644 "/etc/cron.d/surveying-v203-$project"
rm -f "/etc/cron.d/surveying-v202-$project"
systemctl enable --now cron >/dev/null
app="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=app)"
docker exec "$app" node scripts/v20-3-tick.mjs
echo '已启用延迟复测后台任务：每分钟检查，每批最多1次出题和1次批改，会调用现有AI服务。'
