import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("adds real MapLibre terrain and a student route submission flow", async () => {
  const [map, api, dashboard] = await Promise.all([
    source("components/training/map-v18.tsx"),
    source("app/api/training/terrain/route.ts"),
    source("components/classroom/student-dashboard.tsx"),
  ]);
  assert.match(map, /type:'raster-dem'/u);
  assert.match(map, /terrain:\{source:'dem'/u);
  assert.match(map, /WebGL2/u);
  assert.match(api, /user\.role !== "student"/u);
  assert.match(api, /route: z\.array\(RoutePoint\)\.min\(2\)/u);
  assert.match(dashboard, /\/student\/terrain-3d/u);
});

test("protects teacher knowledge uploads and keeps them separate from built-in demo chunks", async () => {
  const [route, store, health] = await Promise.all([
    source("app/api/knowledge/sources/route.ts"),
    source("lib/step17/knowledge-store.mjs"),
    source("app/api/health/route.ts"),
  ]);
  assert.match(route, /requireRequestRole\(request, "teacher"\)/u);
  assert.match(store, /MAX_KNOWLEDGE_UPLOAD_BYTES = 25 \* 1024 \* 1024/u);
  assert.match(store, /目录穿越/u);
  assert.match(store, /嵌套ZIP/u);
  assert.match(store, /knowledge_source_chunks/u);
  assert.match(health, /builtin_knowledge_chunks: chunks\.length/u);
  assert.match(health, /uploaded_knowledge_chunks/u);
});

test("provides a non-destructive version 15 to 17 upgrade with backup and rollback", async () => {
  const [upgrade, compose] = await Promise.all([
    source("scripts/step17-upgrade-from-15.sh"),
    source("docker-compose.yml"),
  ]);
  assert.match(upgrade, /pg_dump --format=custom/u);
  assert.match(upgrade, /pre-v17-/u);
  assert.match(upgrade, /pre-v17-\$\{backup_stamp\}/u);
  assert.match(upgrade, /package_version.*17\.2\.0/u);
  assert.doesNotMatch(upgrade, /compose down -v/u);
  assert.match(compose, /demo_postgres:/u);
  assert.match(compose, /networks: \[database, outbound\]/u);
});
