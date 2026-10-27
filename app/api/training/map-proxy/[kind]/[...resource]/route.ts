import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Agent, ProxyAgent, request as upstreamRequest, type Dispatcher } from "undici";
import {
  getMapSource,
  verifyMapProxyToken,
  type MapSourceKind,
} from "@/lib/step19/map-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TileJson = {
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  bounds?: number[];
  center?: number[];
  scheme?: "xyz" | "tms";
  attribution?: string;
  vector_layers?: unknown[];
  [key: string]: unknown;
};

const metadataCache = new Map<string, { expires: number; value: TileJson }>();
let outboundDispatcher: Dispatcher | undefined;

function dispatcher() {
  if (outboundDispatcher) return outboundDispatcher;
  const proxyUrl = process.env.MAP_OUTBOUND_PROXY?.trim() || process.env.HTTPS_PROXY?.trim() || process.env.https_proxy?.trim();
  outboundDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : new Agent({connect:{timeout:10_000,autoSelectFamily:true,autoSelectFamilyAttemptTimeout:250},connections:8});
  return outboundDispatcher;
}

function validKind(value: string): value is MapSourceKind {
  return value === "dem" || value === "vector";
}

function upstreamUrl(template: string, z: number, x: number, y: number) {
  const decodedTemplate = template.replace(/%7B(z|x|y|-y|ratio|s)%7D/giu, "{$1}");
  const value = decodedTemplate
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y))
    .replaceAll("{-y}", String((2 ** z) - y - 1))
    .replaceAll("{ratio}", "")
    .replaceAll("{s}", "a");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("地图瓦片地址未通过安全校验");
  return url;
}

function header(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function downloadTile(url: URL, accept: string, redirects = 0): Promise<{
  body: ArrayBuffer;
  contentType?: string;
  contentEncoding?: string;
  etag?: string;
  modified?: string;
}> {
  const response = await upstreamRequest(url, {
    dispatcher: dispatcher(),
    signal: AbortSignal.timeout(18_000),
    bodyTimeout: 15_000,
    headersTimeout: 12_000,
    headers: {
      accept,
      "accept-encoding": "identity",
      "user-agent": "JingweiShiguang-MapProxy/19.1",
    },
  });
  const location = header(response.headers.location);
  if (response.statusCode >= 300 && response.statusCode < 400 && location) {
    await response.body.dump();
    if (redirects >= 3) throw new Error("上游瓦片重定向次数过多");
    const redirected = new URL(location, url);
    if (redirected.protocol !== "https:" || redirected.username || redirected.password) throw new Error("上游瓦片重定向未通过安全校验");
    return downloadTile(redirected, accept, redirects + 1);
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    await response.body.dump();
    throw new Error(`上游瓦片返回 ${response.statusCode}`);
  }
  const declaredSize = Number(header(response.headers["content-length"]) || 0);
  if (declaredSize > 8 * 1024 * 1024) {
    await response.body.dump();
    throw new Error("上游瓦片超过8MB安全限制");
  }
  const body = await response.body.arrayBuffer();
  if (!body.byteLength || body.byteLength > 8 * 1024 * 1024) {
    throw new Error(`上游瓦片大小无效（声明 ${declaredSize || "未知"}，收到 ${body.byteLength}）`);
  }
  return {
    body,
    contentType: header(response.headers["content-type"]),
    contentEncoding: header(response.headers["content-encoding"]),
    etag: header(response.headers.etag),
    modified: header(response.headers["last-modified"]),
  };
}

async function tileJson(kind: MapSourceKind) {
  const source = getMapSource(kind);
  if (!source.startsWith("https://")) throw new Error("本地地图地址无需服务器代理");
  const cached = metadataCache.get(source);
  if (cached && cached.expires > Date.now()) return cached.value;
  const response = await downloadTile(new URL(source), "application/json");
  const payload = JSON.parse(new TextDecoder().decode(response.body)) as TileJson;
  if (!Array.isArray(payload.tiles) || !payload.tiles.length || payload.tiles.some((item) => typeof item !== "string")) {
    throw new Error("上游 TileJSON 缺少有效 tiles 模板");
  }
  const normalized = {
    ...payload,
    tiles: payload.tiles.slice(0, 8).map((item) => new URL(item, source).toString().replace(/%7B(z|x|y|-y|ratio|s)%7D/giu, "{$1}")),
  };
  metadataCache.set(source, { expires: Date.now() + 10 * 60 * 1000, value: normalized });
  return normalized;
}

function errorResponse(message: string, status = 502) {
  return NextResponse.json(
    { ok: false, error: message, code: status === 401 ? "MAP_TOKEN_INVALID" : "MAP_UPSTREAM_UNAVAILABLE" },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string; resource: string[] }> },
) {
  const { kind: rawKind, resource } = await context.params;
  if (!validKind(rawKind)) return errorResponse("地图数据类型无效。", 404);
  if (!verifyMapProxyToken(rawKind, request.nextUrl.searchParams.get("token"))) {
    return errorResponse("地图访问令牌已失效，请刷新页面后重试。", 401);
  }
  let attemptedUpstream = "";
  try {
    const metadata = await tileJson(rawKind);
    if (resource.length === 1 && resource[0] === "tilejson") {
      const token = encodeURIComponent(request.nextUrl.searchParams.get("token")!);
      const rewritten: TileJson = {
        ...metadata,
        tiles: [`/api/training/map-proxy/${rawKind}/tile/{z}/{x}/{y}?token=${token}`],
      };
      return NextResponse.json(rewritten, {
        headers: {
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
          "X-Map-Delivery": "same-origin-proxy",
        },
      });
    }
    if (resource.length !== 4 || resource[0] !== "tile") return errorResponse("地图资源路径无效。", 404);
    const [z, x, y] = resource.slice(1).map(Number);
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
      return errorResponse("地图瓦片坐标无效。", 400);
    }
    const template = metadata.tiles[Math.abs(x + y) % metadata.tiles.length];
    const upstream = upstreamUrl(template, z, x, y);
    attemptedUpstream = `${upstream.hostname}${upstream.pathname}`;
    const tile = await downloadTile(
      upstream,
      rawKind === "dem" ? "image/avif,image/webp,image/png,image/*,*/*;q=0.8" : "application/x-protobuf,application/vnd.mapbox-vector-tile,*/*;q=0.8",
    );
    const headers = new Headers({
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Length": String(tile.body.byteLength),
      "Content-Type": tile.contentType || (rawKind === "dem" ? "image/png" : "application/x-protobuf"),
      "X-Content-Type-Options": "nosniff",
      "X-Map-Delivery": "same-origin-proxy",
    });
    if (tile.contentEncoding) headers.set("Content-Encoding", tile.contentEncoding);
    if (tile.etag) headers.set("ETag", tile.etag);
    if (tile.modified) headers.set("Last-Modified", tile.modified);
    return new NextResponse(tile.body, { status: 200, headers });
  } catch (error) {
    console.error(`[map-proxy:${rawKind}]`, attemptedUpstream, error instanceof Error ? error.message : error);
    return errorResponse("三维地图数据源暂时不可达，请稍后重试或联系管理员检查服务器外网连接。");
  }
}
