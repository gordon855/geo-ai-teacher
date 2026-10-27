#!/usr/bin/env bash
set -Eeuo pipefail
new="${1:?release directory}";project="${2:?Compose project name}"
[[ "$new" =~ ^/[A-Za-z0-9_./-]+$ && "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || exit 1
[[ -f "$new/scripts/v20-2-reconcile.sh" ]] || exit 1
printf 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n* * * * * root /bin/bash %s/scripts/v20-2-reconcile.sh %s >> %s/backups/obe-maintenance.log 2>&1\n' "$new" "$project" "$new" > "/etc/cron.d/surveying-v202-$project"
chmod 644 "/etc/cron.d/surveying-v202-$project"
bash "$new/scripts/v20-2-reconcile.sh" "$project"
echo '每分钟最多40份待诊断作业的补偿任务已启用，不调用AI。'
