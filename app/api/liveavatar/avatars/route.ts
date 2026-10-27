import { NextResponse, type NextRequest } from "next/server";
import { getServiceSettings } from "@/lib/cloud/runtime.mjs";
import { assertSameOrigin } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVEAVATAR_API = "https://api.liveavatar.com";

type RawAvatar = {
  id?: unknown;
  name?: unknown;
  preview_url?: unknown;
  status?: unknown;
  is_expired?: unknown;
  is_1080p?: unknown;
};

function response(body: Record<string, unknown>, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store, max-age=0");
  result.headers.set("X-Content-Type-Options", "nosniff");
  return result;
}

async function requestAvatarList(path: string, apiKey: string) {
  const upstream = await fetch(`${LIVEAVATAR_API}${path}`, {
    headers: { "X-API-KEY": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await upstream.json().catch(() => null) as { data?: { results?: RawAvatar[] }; message?: string } | null;
  if (!upstream.ok) throw new Error(payload?.message || `LiveAvatar人物列表请求失败（${upstream.status}）`);
  return Array.isArray(payload?.data?.results) ? payload.data.results : [];
}

function normalizeAvatar(avatar: RawAvatar, source: "user" | "public") {
  const id = typeof avatar.id === "string" ? avatar.id : "";
  if (!id) return null;
  return {
    id,
    name: typeof avatar.name === "string" && avatar.name.trim() ? avatar.name.trim() : "未命名人物",
    previewUrl: typeof avatar.preview_url === "string" ? avatar.preview_url : "",
    status: typeof avatar.status === "string" ? avatar.status : "",
    expired: avatar.is_expired === true,
    is1080p: avatar.is_1080p === true,
    source,
  };
}

export async function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return response({ ok: false, error: { code: auth.status === 401 ? "LOGIN_REQUIRED" : "TEACHER_ONLY", message: auth.error } }, auth.status);
    const settings = await getServiceSettings();
    if (!settings.LIVEAVATAR_API_KEY) {
      return response({ ok: false, configured: false, avatars: [], error: { code: "LIVEAVATAR_NOT_CONFIGURED", message: "教师尚未配置LiveAvatar API密钥。" } }, 503);
    }
    const [userAvatars, publicAvatars] = await Promise.all([
      requestAvatarList("/v1/avatars?page=1&page_size=100", settings.LIVEAVATAR_API_KEY),
      requestAvatarList("/v1/avatars/public?page=1&page_size=100", settings.LIVEAVATAR_API_KEY),
    ]);
    const seen = new Set<string>();
    const avatars = [
      ...userAvatars.map((item) => normalizeAvatar(item, "user")),
      ...publicAvatars.map((item) => normalizeAvatar(item, "public")),
    ].filter((item): item is NonNullable<typeof item> => {
      if (!item || item.expired || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return response({ ok: true, configured: true, avatars, defaultAvatarId: settings.LIVEAVATAR_DEFAULT_AVATAR_ID });
  } catch (error) {
    return response({ ok: false, configured: true, avatars: [], error: { code: "LIVEAVATAR_LIST_FAILED", message: error instanceof Error ? error.message : "无法读取LiveAvatar人物列表。" } }, 502);
  }
}
