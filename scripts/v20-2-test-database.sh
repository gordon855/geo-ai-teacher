#!/usr/bin/env bash
set -Eeuo pipefail
old="${1:?old directory}";new="${2:?new directory}";project="${3:?project}"
oldc=(docker compose --project-directory "$old" --env-file "$old/.env" -p "$project" -f "$old/docker-compose.yml")
newc=(docker compose --project-directory "$new" --env-file "$new/.env" -p "$project" -f "$new/docker-compose.yml")
db="$("${oldc[@]}" ps -q postgres)"
testdb="surveying_v19_test_$(date +%s)"
cleanup(){ docker exec "$db" sh -c 'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' sh "$testdb"; }
trap cleanup EXIT
docker exec "$db" sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$testdb"
# Passed as a process environment override to Compose; no secret is printed.
DATABASE_URL="$("${newc[@]}" config --format json | python3 -c 'import sys,json;from urllib.parse import urlsplit,urlunsplit;u=urlsplit(json.load(sys.stdin)["services"]["app"]["environment"]["DATABASE_URL"]);print(urlunsplit((u.scheme,u.netloc,"/"+sys.argv[1],u.query,u.fragment)))' "$testdb")"
export DATABASE_URL
"${newc[@]}" run --rm --no-deps -T -e DATABASE_URL app sh -c 'node scripts/v19-smoke-database.mjs && node scripts/v20-smoke-database.mjs && node scripts/v20-2-smoke-database.mjs'
