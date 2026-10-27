#!/usr/bin/env bash
# GEOAI_OSS_LEGACY_DISABLED: historical deployment source retained for review.
echo "This legacy in-place deployment script is disabled in the OSS edition. Use docs/INSTALL.md with a fresh demo volume." >&2
exit 2
# Upgrade app and add Nginx logging while preserving project, database, storage and TLS.
set -Eeuo pipefail
umask 077
new="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
old="$(cd -- "${1:?请传入正在运行的旧版本目录}" && pwd -P)"
[[ "$old" != "$new" ]] || { echo '新旧目录不能相同。';exit 1; }
for command in docker python3 curl flock crontab openssl; do command -v "$command" >/dev/null || { echo "缺少命令：$command";exit 1; }; done
docker compose version >/dev/null
[[ -f "$old/.env" && -f "$old/docker-compose.yml" ]] || { echo '旧目录缺少配置。';exit 1; }
exec 9>"/opt/surveying-upgrade.lock";flock -n 9 || { echo '已有升级正在进行。';exit 1; }
[[ ! -e "$new/UPGRADE_SUCCESS" ]] || { echo '此目录已升级成功，请先按说明验收，不要重复升级。';exit 1; }
project="$(python3 - "$old/.env" <<'PY'
import re,sys
s=open(sys.argv[1]).read();m=re.findall(r'^\s*COMPOSE_PROJECT_NAME\s*=\s*([^\n]+)',s,re.M)
assert len(m)==1,'旧.env必须明确设置唯一COMPOSE_PROJECT_NAME'
p=m[0].strip().strip('\"\'');assert re.fullmatch(r'[a-z0-9][a-z0-9_-]*',p),'项目名不合法';print(p)
PY
)"
oldc=(docker compose --project-directory "$old" --env-file "$old/.env" -p "$project" -f "$old/docker-compose.yml")
newc=(docker compose --project-directory "$new" --env-file "$new/.env" -p "$project" -f "$new/docker-compose.yml")
app="$("${oldc[@]}" ps -q app)"; db="$("${oldc[@]}" ps -q postgres)"
[[ -n "$app" && -n "$db" ]] || { echo '未找到旧版本运行中的app和postgres。';exit 1; }
actual="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$app")"
[[ "$actual" == "$old" ]] || { echo "实际运行目录是：$actual。请使用该目录重新运行。";exit 1; }
version="$(docker exec "$app" node -p 'require("./package.json").version')"
[[ "$version" =~ ^21\.[234]\.0$ ]] || { echo "实际线上版本 $version；本脚本只支持21.2.0、21.3.0或21.4.0升级到21.5.0，请停止核对。";exit 1; }
curl -fsS --max-time 10 http://127.0.0.1:3000/api/health | python3 -c 'import json,sys;assert json.load(sys.stdin).get("package_version")in ("21.2.0","21.3.0","21.4.0")'
exec 8>"/run/lock/surveying-obe-$project.lock";flock -w 300 8 || { echo '后台任务尚未结束，请稍后重试';exit 1; }
if [[ -e "$new/.env" ]]; then cmp -s "$old/.env" "$new/.env" || { echo '新旧.env不同，停止升级；请核对后再继续。';exit 1; };else cp -p "$old/.env" "$new/.env";fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"; backup="$new/backups/pre-v21-5-$stamp";mkdir -p "$backup"
if [[ -f "/etc/cron.d/surveying-v19-$project" ]]; then cp -p "/etc/cron.d/surveying-v19-$project" "$backup/old-retention-cron";else touch "$backup/no-old-retention-cron";fi
if [[ -f "/etc/cron.d/surveying-v202-$project" ]]; then cp -p "/etc/cron.d/surveying-v202-$project" "$backup/old-obe-cron";else touch "$backup/no-old-obe-cron";fi
if [[ -f "/etc/cron.d/surveying-v203-$project" ]]; then cp -p "/etc/cron.d/surveying-v203-$project" "$backup/old-stage2-cron";else touch "$backup/no-old-stage2-cron";fi
cp -p "$old/.env" "$backup/old.env";cp "$old/docker-compose.yml" "$backup/old-compose.yml"
if [[ -d "$old/deploy/nginx" ]]; then cp -a "$old/deploy/nginx" "$backup/nginx";fi
"${newc[@]}" config --format json > "$backup/new-config.json"
nginx="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=nginx | head -1)"
if [[ -z "$nginx" ]]; then
  root_domain="$(python3 - "$backup/new-config.json" <<'PY'
import json,sys
value=json.load(open(sys.argv[1]))['services']['app']['environment'].get('ROOT_DOMAIN','')
assert value and '/' not in value and '..' not in value, 'ROOT_DOMAIN无效'
print(value)
PY
)"
  cert_volume="${project}_letsencrypt"
  cert_root="$(docker volume inspect "$cert_volume" -f '{{.Mountpoint}}' 2>/dev/null || true)"
  [[ -n "$cert_root" ]] || { echo "未找到证书卷：$cert_volume；第21版尚未切换。"; exit 1; }
  [[ -s "$cert_root/live/$root_domain/fullchain.pem" && -s "$cert_root/live/$root_domain/privkey.pem" ]] || { echo "证书卷中缺少 $root_domain 的HTTPS证书；第21版尚未切换。"; exit 1; }
  openssl x509 -checkend 86400 -noout -in "$cert_root/live/$root_domain/fullchain.pem" >/dev/null || { echo '现有HTTPS证书已过期或将在24小时内过期；第21版尚未切换。'; exit 1; }
  echo "预检通过：将利用 $cert_volume 恢复新的公网Nginx容器。"
fi
docker inspect "$app" "$db" > "$backup/old-containers.json"
python3 - "$backup" <<'PY'
import json,sys,pathlib
b=pathlib.Path(sys.argv[1]);actual=json.loads((b/'old-containers.json').read_text());config=json.loads((b/'new-config.json').read_text());a,d=actual
old=dict(x.split('=',1) for x in a['Config']['Env'] if '=' in x);new=config['services']['app']['environment']
assert new.get('APP_ENCRYPTION_KEY'),'APP_ENCRYPTION_KEY未配置，停止升级'
keys=['DATABASE_URL','STORAGE_DRIVER','LOCAL_STORAGE_PATH','APP_ENCRYPTION_KEY','ROOT_DOMAIN','WWW_DOMAIN','CLASSROOM_PUBLIC_ORIGIN','OSS_BUCKET','OSS_ENDPOINT','OSS_REGION','ALIBABA_CLOUD_ACCESS_KEY_ID','ALIBABA_CLOUD_ACCESS_KEY_SECRET','DASHSCOPE_API_KEY','BAILIAN_WORKSPACE_ID','AI_PROVIDER','OAC_ENABLED','OAC_BRIDGE_KEY','OAC_LITEAVATAR_URL','OAC_LAM_URL']
for k in keys: assert str(old.get(k,'') or '')==str(new.get(k,'') or ''),'原运行配置与新配置不一致：'+k+'。请核对后再升级。'
for service,obj,target in [('app',a,'/app/.data/storage'),('postgres',d,'/var/lib/postgresql/data')]:
 mounts=[x for x in obj['Mounts'] if x['Destination']==target];assert len(mounts)==1 and mounts[0]['Type']=='volume','需要已存在的命名数据卷：'+target
 planned=[x for x in config['services'][service]['volumes'] if x['target']==target];assert len(planned)==1
 resolved=config['volumes'][planned[0]['source']]['name'];assert resolved==mounts[0]['Name'],'检测到数据卷变化，已停止升级：'+service
 if service=='app':(b/'storage-volume.txt').write_text(resolved)
print('配置与实际运行数据卷匹配。')
PY
printf '%s\n' "$version" > "$backup/old-version.txt"
oldimage="$(docker inspect -f '{{.Image}}' "$app")";tag="${project}-app:pre-v21-5-${stamp}"
docker tag "$oldimage" "$tag"
printf '%s\n' "$old" > "$backup/old-dir.txt";printf '%s\n' "$project" > "$backup/project.txt";printf '%s\n' "$tag" > "$backup/old-image.txt"
printf 'services:\n  app:\n    image: %s\n' "$tag" > "$backup/rollback-compose.yml"
printf '%s\n' "$backup" > "$new/LAST_BACKUP"
echo '正在构建版本21.5，此阶段旧网站继续运行。'
"${newc[@]}" build app
# Validate the new voice pipeline in the built container before stopping the old app.
"${newc[@]}" run --rm --no-deps -T app node --test tests/v21-2-speech.test.mjs tests/v21-5-presentation.test.mjs
echo "在独立临时数据库验证审核、举报、留存与历史归档；不会写入课程数据库。"
bash "$new/scripts/v21-5-test-database.sh" "$old" "$new" "$project"
stopped=0
recover(){ local code=$?;trap - ERR INT TERM;if [[ "$stopped" == 1 ]];then echo '升级中断，正在恢复旧应用。';bash "$new/scripts/v21-5-rollback.sh" "$backup" || echo "自动回退未完成，请检查并手动回退：$backup";fi;if [[ "$code" == 0 ]];then code=1;fi;exit "$code"; }
trap recover ERR INT TERM
stopped=1
"${oldc[@]}" stop app
# With the app stopped, course tables and local uploads form a consistent backup.
docker exec -i "$db" sh -c 'psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$new/scripts/v19-counts.sql" > "$backup/counts-before.txt"
docker exec "$db" sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup/database.dump"
[[ -s "$backup/database.dump" ]]
docker exec -i "$db" pg_restore --list < "$backup/database.dump" > "$backup/database-contents.txt"
volume="$(cat "$backup/storage-volume.txt")";dbimage="$(docker inspect -f '{{.Image}}' "$db")"
docker run --rm --network none --read-only --entrypoint tar -v "$volume:/source:ro" "$dbimage" -czf - -C /source . > "$backup/local-storage.tar.gz"
[[ -s "$backup/local-storage.tar.gz" ]]
"${newc[@]}" up -d --no-deps --force-recreate app
ready=0
for ((i=0;i<90;i++));do
 if curl -fsS --max-time 4 http://127.0.0.1:3000/api/health > "$backup/new-health.json" && python3 -c 'import json,sys;p=json.load(open(sys.argv[1]));sys.exit(0 if p.get("ok") and p.get("package_version")=="21.5.0" and p.get("builtin_knowledge_chunks",p.get("knowledge_chunks"))==813 else 1)' "$backup/new-health.json";then ready=1;break;fi
 sleep 2
done
[[ "$ready" == 1 ]]
COMPOSE_PROJECT_NAME="$project" bash "$new/scripts/v21-5-verify.sh"
docker exec -i "$db" sh -c 'psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$new/scripts/v19-counts.sql" > "$backup/counts-after.txt"
python3 - "$backup" <<'PY'
import pathlib,sys
b=pathlib.Path(sys.argv[1])
def read(n):
 rows={}
 for l in (b/n).read_text().splitlines():
  if '|' in l:k,v=l.rsplit('|',1);rows[k]=int(v)
 return rows
old=read('counts-before.txt');new=read('counts-after.txt');assert old,'未读取到数据表计数'
for k,v in old.items():assert new.get(k,-1)>=v,'数据表记录减少：'+k
print('已核对',len(old),'张非临时数据表，记录数未减少。')
PY
bash "$new/scripts/v19-enable-logs.sh" "$old" "$new" "$backup" "$project"
bash "$new/scripts/v20-3-enable-reconcile.sh" "$new" "$project"
COMPOSE_PROJECT_NAME="$project" bash "$new/scripts/v21-5-verify.sh"
stopped=0;trap - ERR INT TERM
flock -u 8
printf 'version=21.5.0\nold=%s\nnew=%s\nbackup=%s\n' "$old" "$new" "$backup" > "$new/UPGRADE_SUCCESS"
cp -p "$new/UPGRADE_SUCCESS" "$new/V215_UPGRADE_SUCCESS"
echo "升级完成：$new";echo "备份目录：$backup";echo '请继续运行公网检查，并登录核对数据、问答、PPT、上传和三维场景。保留旧目录、备份和旧镜像。'
