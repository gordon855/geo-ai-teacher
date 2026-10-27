import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";

test("keeps all 54 frozen course knowledge chunks", async () => {
  const encoded = await readFile(new URL("../lib/cloud/knowledge-chunks.jsonl.gz.b64", import.meta.url), "utf8");
  const text = gunzipSync(Buffer.from(encoded.replace(/\s+/gu, ""), "base64")).toString("utf8").trim();
  assert.equal(text.split(/\r?\n/u).filter(Boolean).length, 54);
});

test("contains the selected domain, personal non-official notice and ICP safety gate", async () => {
  const [environment, footer, publicScript] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../components/site-legal-footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/step15-enable-public.sh", import.meta.url), "utf8"),
  ]);
  assert.match(environment, /ROOT_DOMAIN=localhost/u);
  assert.match(environment, /WWW_DOMAIN=localhost/u);
  assert.match(footer, /独立部署的教学辅助工具/u);
  assert.match(publicScript, /ICP_APPROVED/u);
  assert.match(publicScript, /已拒绝公开/u);
});

test("identifies the independently deployable package as version 21.7", async () => {
  const [packageSource, healthSource] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(JSON.parse(packageSource).version, "21.7.0");
  assert.match(healthSource, /package_version: "21\.7\.0"/u);
});

test("keeps the demo isolated from legacy production volumes", async () => {
  const [environment, upgradeScript] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../scripts/step15-upgrade-from-14.2.sh", import.meta.url), "utf8"),
  ]);
  assert.match(environment, /^COMPOSE_PROJECT_NAME=GENERATE_PROJECT$/mu);
  assert.match(upgradeScript, /pg_dump --format=custom/u);
  assert.doesNotMatch(upgradeScript, /compose down -v/u);
});
