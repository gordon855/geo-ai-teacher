import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("restores the selected version 16 student and teacher interface in production", async () => {
  const [student, teacher, hub, css] = await Promise.all([
    source("components/classroom/student-dashboard.tsx"),
    source("components/classroom/teacher-dashboard.tsx"),
    source("components/v172/training-hubs.tsx"),
    source("app/v16-design.css"),
  ]);
  assert.match(student, /StudentTrainingHubV172/u);
  assert.match(student, /app-shell student-theme/u);
  assert.match(teacher, /TeacherCommandCenterV172/u);
  assert.match(teacher, /app-shell teacher-theme/u);
  assert.match(hub, /地形与城市3D/u);
  assert.match(hub, /文献精读/u);
  assert.match(hub, /软件术语/u);
  assert.match(hub, /Terrain3dLab/u);
  assert.match(css, /teacher-command-grid/u);
  assert.match(css, /literature-layout/u);
});

test("ships the real version 16 visual assets", async () => {
  await Promise.all([
    access(new URL("../public/v16/ai-teacher.svg", import.meta.url)),
    access(new URL("../public/v16/brand-logo.svg", import.meta.url)),
    access(new URL("../public/v16/grand-canyon-topographic.svg", import.meta.url)),
    access(new URL("../public/v16/lidar-point-cloud.svg", import.meta.url)),
  ]);
});

test("provides a non-destructive version 17 to 17.2 replacement with backup and rollback", async () => {
  const upgrade = await source("scripts/step17-2-upgrade-from-17.sh");
  assert.match(upgrade, /\/opt\/surveying-ai-teacher-step17/u);
  assert.match(upgrade, /pg_dump --format=custom/u);
  assert.match(upgrade, /pre-v17\.2-/u);
  assert.match(upgrade, /package_version.*17\.2\.0/u);
  assert.match(upgrade, /rollback_app/u);
  assert.match(upgrade, /COMPOSE_PROJECT_NAME:-.*geoai_demo_legacy/u);
  assert.doesNotMatch(upgrade, /compose down -v/u);
});
