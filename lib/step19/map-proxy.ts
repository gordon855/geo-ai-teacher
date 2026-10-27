import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type MapSourceKind = "dem" | "vector";

export const DEFAULT_MAP_SOURCES: Record<MapSourceKind, string> = {
  dem: "https://tiles.mapterhorn.com/tilejson.json",
  vector: "https://tiles.openfreemap.org/planet/latest",
};

function configuredSource(kind: MapSourceKind) {
  const configured = (kind === "dem"
    ? process.env.MAP_DEM_TILEJSON_URL
    : process.env.MAP_VECTOR_TILEJSON_URL)?.trim();
  if (!configured) return DEFAULT_MAP_SOURCES[kind];
  if (configured.startsWith("/") && !configured.startsWith("//")) return configured;
  try {
    const parsed = new URL(configured);
    if (parsed.hostname === "tiles.openfreemap.org" && /^\/planet\/?$/.test(parsed.pathname)) {
      parsed.pathname = "/planet/latest";
    }
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return parsed.toString();
  } catch {
    // Invalid administrator configuration falls back to the reviewed public source.
  }
  return DEFAULT_MAP_SOURCES[kind];
}

export function getMapSource(kind: MapSourceKind) {
  return configuredSource(kind);
}

export function shouldProxyMapSource(source: string) {
  return source.startsWith("https://");
}

function signingSecret() {
  const secret = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 24) throw new Error("APP_ENCRYPTION_KEY 未配置，无法签发地图代理令牌");
  return secret;
}

function signature(kind: MapSourceKind, expires: number) {
  return createHmac("sha256", signingSecret()).update(`map-v19.1:${kind}:${expires}`).digest("base64url");
}

export function createMapProxyToken(kind: MapSourceKind, ttlSeconds = 12 * 60 * 60) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${expires}.${signature(kind, expires)}`;
}

export function verifyMapProxyToken(kind: MapSourceKind, token: string | null) {
  if (!token) return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + 13 * 60 * 60) return false;
  const expected = Buffer.from(signature(kind, expires));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
