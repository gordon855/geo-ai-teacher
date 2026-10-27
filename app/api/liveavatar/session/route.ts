import { NextResponse, type NextRequest } from "next/server";
import { acquireLiveAvatarLease, activateLiveAvatarLease, heartbeatLiveAvatarLease, releaseLiveAvatarLease } from "@/lib/cloud/liveavatar-lease.mjs";
import { getServiceSettings } from "@/lib/cloud/runtime.mjs";
import { assertSameOrigin } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIVEAVATAR_API = "https://api.liveavatar.com";

function response(body: Record<string, unknown>, status = 200, retryAfter?: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store, max-age=0");
  result.headers.set("X-Content-Type-Options", "nosniff");
  if (retryAfter) result.headers.set("Retry-After", String(retryAfter));
  return result;
}

function validAvatarId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) throw new Error("请选择有效的LiveAvatar人物后再启动。");
  return id;
}

async function authenticatedUser(request: NextRequest) {
  assertSameOrigin(request);
  const user = await currentRequestUser(request);
  if (!user) throw Object.assign(new Error("请先登录后再启动LiveAvatar。"), { status: 401, code: "LOGIN_REQUIRED" });
  if (user.role !== "teacher") throw Object.assign(new Error("真人数字教师为课堂单路资源，仅允许教师账号启动。"), { status: 403, code: "TEACHER_ONLY" });
  return user;
}

export async function POST(request: NextRequest) {
  let leaseId = "";
  let userId = "";
  try {
    const user = await authenticatedUser(request);
    userId = user.id;
    const settings = await getServiceSettings();
    if (!settings.LIVEAVATAR_API_KEY) return response({ ok: false, error: { code: "LIVEAVATAR_NOT_CONFIGURED", message: "教师尚未配置LiveAvatar API密钥。" } }, 503);
    const payload = await request.json().catch(() => null) as { avatarId?: unknown } | null;
    const avatarId = validAvatarId(payload?.avatarId);
    const lease = await acquireLiveAvatarLease(user.id);
    if (!lease.ok) {
      return response({ ok: false, error: { code: "LIVEAVATAR_SINGLE_SESSION_BUSY", message: lease.state === "creating" ? "正在建立上一连接，请稍候自动重试。" : "当前教师会话仍在占用真人数字教师单路并发，请先结束原会话。" } }, 429, lease.retryAfter);
    }
    leaseId = String(lease.leaseId);
    const upstream = await fetch(`${LIVEAVATAR_API}/v1/sessions/token`, {
      method: "POST",
      headers: { "X-API-KEY": settings.LIVEAVATAR_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_id: avatarId, mode: "LITE", is_sandbox: false, video_settings: { quality: "medium", encoding: "H264" }, max_session_duration: lease.maxSessionSeconds }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const result = await upstream.json().catch(() => null) as { data?: { session_id?: string; session_token?: string }; message?: string } | null;
    const sessionToken = String(result?.data?.session_token || "");
    if (!upstream.ok || !sessionToken) {
      await releaseLiveAvatarLease(leaseId, user.id);
      leaseId = "";
      return response({ ok: false, error: { code: upstream.status === 401 || upstream.status === 403 ? "LIVEAVATAR_KEY_REJECTED" : "LIVEAVATAR_SESSION_FAILED", message: result?.message || `LiveAvatar会话创建失败（${upstream.status}）。` } }, upstream.status === 401 || upstream.status === 403 ? 503 : 502);
    }
    await activateLiveAvatarLease(leaseId, user.id);
    return response({ ok: true, sessionToken, sessionId: String(result?.data?.session_id || ""), leaseId, maxSessionDuration: lease.maxSessionSeconds, quality: "medium", mode: "LITE" });
  } catch (error) {
    if (leaseId && userId) await releaseLiveAvatarLease(leaseId, userId).catch(() => null);
    const typed = error as Error & { status?: number; code?: string };
    return response({ ok: false, error: { code: typed.code || "LIVEAVATAR_SESSION_FAILED", message: typed.message || "LiveAvatar会话启动失败。" } }, Number(typed.status || 500));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    const payload = await request.json().catch(() => null) as { leaseId?: unknown } | null;
    const leaseId = typeof payload?.leaseId === "string" ? payload.leaseId : "";
    return response({ ok: true, active: leaseId ? await heartbeatLiveAvatarLease(leaseId, user.id) : false });
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return response({ ok: false, error: { code: typed.code || "LIVEAVATAR_HEARTBEAT_FAILED", message: typed.message } }, Number(typed.status || 500));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    const payload = await request.json().catch(() => null) as { leaseId?: unknown } | null;
    const leaseId = typeof payload?.leaseId === "string" ? payload.leaseId : "";
    if (leaseId) await releaseLiveAvatarLease(leaseId, user.id);
    return response({ ok: true });
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return response({ ok: false, error: { code: typed.code || "LIVEAVATAR_RELEASE_FAILED", message: typed.message } }, Number(typed.status || 500));
  }
}
