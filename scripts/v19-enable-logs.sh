#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
old="${1:?old directory}"; new="${2:?new directory}"; backup="${3:?backup directory}"; project="${4:?project}"
[[ -f "$new/.env" && -f "$new/docker-compose.yml" ]] || { echo '第19版目录缺少.env或docker-compose.yml。'; exit 1; }
command -v openssl >/dev/null || { echo '服务器缺少openssl，无法验证现有HTTPS证书。'; exit 1; }
newc=(docker compose --project-directory "$new" --env-file "$new/.env" -p "$project" -f "$new/docker-compose.yml")
nginx="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=nginx | head -1)"
source_conf=""
if [[ -n "$nginx" ]]; then
  source_conf="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/nginx/conf.d/default.conf"}}{{.Source}}{{end}}{{end}}' "$nginx")"
fi
if [[ -n "$source_conf" && -f "$source_conf" ]]; then
  case "$source_conf" in "$old"/*|"$new"/*) ;; *) echo "Nginx配置位于未预期路径：$source_conf"; exit 1;; esac
  cp -p "$source_conf" "$backup/nginx-active-before.conf"
  [[ "$source_conf" == "$new/deploy/nginx/active.conf" ]] || cp -p "$source_conf" "$new/deploy/nginx/active.conf"
  docker inspect "$nginx" > "$backup/old-nginx.json"
else
  root_domain="$(python3 - "$backup/new-config.json" <<'PY'
import json,sys
value=json.load(open(sys.argv[1]))['services']['app']['environment'].get('ROOT_DOMAIN','')
assert value and '/' not in value and '..' not in value, 'ROOT_DOMAIN无效'
print(value)
PY
)"
  cert_volume="${project}_letsencrypt"
  cert_root="$(docker volume inspect "$cert_volume" -f '{{.Mountpoint}}' 2>/dev/null || true)"
  [[ -n "$cert_root" ]] || { echo "未找到证书卷：$cert_volume"; exit 1; }
  [[ -s "$cert_root/live/$root_domain/fullchain.pem" && -s "$cert_root/live/$root_domain/privkey.pem" ]] || { echo "证书卷中缺少 $root_domain 的证书。"; exit 1; }
  openssl x509 -checkend 86400 -noout -in "$cert_root/live/$root_domain/fullchain.pem" >/dev/null || { echo '现有HTTPS证书已过期或将在24小时内过期。'; exit 1; }
  bash "$new/scripts/step17-render-nginx.sh" https
  cp -p "$new/deploy/nginx/active.conf" "$backup/nginx-active-before.conf"
fi
conf="$new/deploy/nginx/active.conf"
printf '%s\n' "$conf" > "$backup/nginx-config-path.txt"
printf '%s\n' "$new" > "$backup/nginx-base-dir.txt"
python3 "$new/scripts/v19-nginx-config.py" "$conf"
cat > "$new/deploy/v19-logging-compose.yml" <<EOF
services:
  nginx:
    volumes:
      - security_logs:/var/log/v19
    command: ["/bin/sh", "-c", "chown nginx:nginx /var/log/v19 && chmod 750 /var/log/v19 && exec nginx -g 'daemon off;'"]
volumes:
  security_logs:
    name: ${project}_security_logs
EOF
logc=("${newc[@]}" -f "$new/deploy/v19-logging-compose.yml" --profile public)
"${logc[@]}" run --rm --no-deps nginx nginx -t
"${logc[@]}" up -d --no-deps --force-recreate nginx
nginx="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=nginx | head -1)"
[[ -n "$nginx" ]] || { echo 'Nginx容器创建后未运行。'; exit 1; }
docker exec "$nginx" nginx -t
origin="$(python3 - "$backup/new-config.json" <<'PY'
import json,sys
from urllib.parse import urlsplit
u=urlsplit(json.load(open(sys.argv[1]))['services']['app']['environment']['CLASSROOM_PUBLIC_ORIGIN'])
assert u.scheme=='https' and u.hostname,'线上origin应为HTTPS'
print(u.hostname)
PY
)"
for ((i=0;i<20;i++)); do curl -fsS --max-time 5 --resolve "$origin:443:127.0.0.1" "https://$origin/api/health" >/dev/null && break; sleep 1; done
curl -fsS --max-time 10 --resolve "$origin:443:127.0.0.1" "https://$origin/api/health" >/dev/null
docker exec "$nginx" sh -c 'test -n "$(find /var/log/v19 -name "access-*.log" -size +0c -print -quit)"'
[[ "$new" =~ ^/[A-Za-z0-9_./-]+$ && "$project" =~ ^[a-z0-9_-]+$ ]] || { echo '路径不适合写入cron。'; exit 1; }
command -v crontab >/dev/null || { echo '服务器缺少cron/crontab。'; exit 1; }
cron_dir="${V19_CRON_DIR:-/etc/cron.d}"
mkdir -p "$cron_dir"
printf '17 3 * * * root /bin/bash %s/scripts/v19-retention.sh %s >> %s/backups/security-maintenance.log 2>&1\n' "$new" "$project" "$new" > "$cron_dir/surveying-v19-$project"
chmod 644 "$cron_dir/surveying-v19-$project"
if command -v systemctl >/dev/null; then systemctl enable --now cron 2>/dev/null || systemctl enable --now crond; fi
bash "$new/scripts/v19-retention.sh" "$project"
echo '已创建/更新公网Nginx，HTTPS与JSON访问日志检查通过。'
