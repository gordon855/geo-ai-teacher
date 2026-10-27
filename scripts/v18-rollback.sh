#!/usr/bin/env bash
# GEOAI_OSS_LEGACY_DISABLED: historical deployment source retained for review.
echo "This legacy in-place deployment script is disabled in the OSS edition. Use docs/INSTALL.md with a fresh demo volume." >&2
exit 2
set -Eeuo pipefail
backup="${1:?请指定完整备份目录}"
for file in old-dir.txt project.txt old-image.txt rollback-compose.yml; do [[ -s "$backup/$file" ]] || { echo "缺少备份元数据：$file"; exit 1; }; done
old="$(cat "$backup/old-dir.txt")"; project="$(cat "$backup/project.txt")"; tag="$(cat "$backup/old-image.txt")"
[[ -f "$old/.env" && -f "$old/docker-compose.yml" ]] || { echo '旧目录不完整，停止回退。'; exit 1; }
docker image inspect "$tag" >/dev/null
oldc=(docker compose --project-directory "$old" --env-file "$old/.env" -p "$project" -f "$old/docker-compose.yml")
"${oldc[@]}" -f "$backup/rollback-compose.yml" up -d --no-deps --no-build --force-recreate app
ready=0
for ((i=0;i<60;i++)); do
 if curl -fsS --max-time 4 http://127.0.0.1:3000/api/health > "$backup/rollback-health.json"; then ready=1;break;fi
 sleep 2
done
[[ "$ready" == 1 ]] || { echo '旧版本尚未恢复健康，请检查容器日志。';exit 1; }
nginx="$("${oldc[@]}" --profile public ps -q nginx)"
if [[ -n "$nginx" ]]; then docker exec "$nginx" nginx -t;docker exec "$nginx" nginx -s reload;fi
echo '旧应用镜像已恢复。数据库未回滚，升级后新增的数据仍保留。'
cat "$backup/rollback-health.json"
