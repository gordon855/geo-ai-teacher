import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";
import { enforceVoiceRateLimit } from "@/lib/step10-2/voice-guard.mjs";
import {
  assertTrustedAudioUrl,
  isVoiceServiceError,
  synthesizeTeacherSpeech,
} from "@/lib/step10-2/voice-service.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchTrustedAudio(initialUrl: string, signal: AbortSignal) {
  let currentUrl = assertTrustedAudioUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    const response = await fetch(currentUrl, { cache: "no-store", redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 2) throw new Error("voice audio redirect invalid");
      currentUrl = assertTrustedAudioUrl(new URL(location, currentUrl).toString());
      continue;
    }
    return response;
  }
  throw new Error("voice audio redirect limit exceeded");
}

function jsonError(error: unknown, requestId: string) {
  const safe = isVoiceServiceError(error)
    ? error
    : error && typeof error === "object" && "httpStatus" in error && "publicMessage" in error
      ? error as { httpStatus: number; publicMessage: string; code?: string }
      : null;
  if (!safe) console.error(`[voice-speech:${requestId}] unexpected error`);
  const response = NextResponse.json({
    ok: false,
    request_id: requestId,
    error: {
      code: safe && "code" in safe ? String(safe.code || "VOICE_FAILED") : "VOICE_FAILED",
      message: safe?.publicMessage || "AI教师语音暂时不可用，请稍后重试。",
    },
  }, { status: Number(safe?.httpStatus || 500) });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Request-Id", requestId);
  if (Number(safe?.httpStatus || 500) === 429) response.headers.set("Retry-After", "1");
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    if (!await currentRequestUser(request)) {
      return NextResponse.json({ ok: false, error: { code: "LOGIN_REQUIRED", message: "请先登录学生课程空间，再使用AI教师语音。" } }, { status: 401 });
    }
    assertSameOrigin(request);
    enforceVoiceRateLimit(request);
    const payload = await request.json().catch(() => null) as { text?: unknown; language?: unknown; rate?: unknown } | null;
    const text = typeof payload?.text === "string" ? payload.text : "";
    const language = payload?.language === "en" || payload?.language === "zh" ? payload.language : "mixed";
    const rate = typeof payload?.rate === "number" ? payload.rate : undefined;
    const result = await synthesizeTeacherSpeech({ text, language, rate });
    const audioUrl = assertTrustedAudioUrl(result.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let upstream: Response;
    try {
      upstream = await fetchTrustedAudio(audioUrl, controller.signal);
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok) throw new Error(`voice audio fetch failed: ${upstream.status}`);
    const audio = await upstream.arrayBuffer();
    if (!audio.byteLength || audio.byteLength > 12 * 1024 * 1024) throw new Error("voice audio size invalid");
    const response = new NextResponse(audio, { status: 200 });
    response.headers.set("Content-Type", "audio/mpeg");
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-AI-Generated-Voice", "true");
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    return jsonError(error, requestId);
  }
}
