import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("repairs the legacy OpenFreeMap endpoint and sends DEM/vector traffic through a signed same-origin proxy", async () => {
  const [config, proxy, security, map, middleware] = await Promise.all([
    source("app/api/training/map-config/route.ts"),
    source("app/api/training/map-proxy/[kind]/[...resource]/route.ts"),
    source("lib/step19/map-proxy.ts"),
    source("components/training/map-v18.tsx"),
    source("proxy.ts"),
  ]);
  assert.match(security, /https:\/\/tiles\.openfreemap\.org\/planet\/latest/u);
  assert.match(security, /map-v19\.1/u);
  assert.match(config, /same-origin-proxy/u);
  assert.match(proxy, /verifyMapProxyToken/u);
  assert.match(proxy, /X-Map-Delivery/u);
  assert.match(map, /矢量底图与DEM已载入/u);
  assert.match(map, /18秒内没有载入/u);
  assert.match(middleware, /training\/map-proxy\//u);
});

test("shows the requested telephone number in the AI teacher Q&A header", async () => {
  const chat = await source("components/chat-workspace.tsx");
  assert.match(chat, /href="tel:13623409954"/u);
  assert.match(chat, /联系电话 13623409954/u);
});

test("keeps version 19 moderation, complaint, retention and exact-selection translation features", async () => {
  const required = [
    "app/api/reports/route.ts",
    "app/api/classroom/barrage/route.ts",
    "lib/step19/policy.mjs",
    "lib/step19/selection-translation.mjs",
    "scripts/v19-retention.sh",
  ];
  await Promise.all(required.map((path) => source(path)));
  const translation = await source("lib/step19/selection-translation.mjs");
  assert.match(translation, /targetText/u);
});
