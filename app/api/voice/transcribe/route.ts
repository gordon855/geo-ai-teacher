import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";
import { enforceVoiceRateLimit } from "@/lib/step10-2/voice-guard.mjs";
import {
  isVoiceServiceError,
  transcribeVoiceAudio,
} from "@/lib/step10-2/voice-service.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function json(body: Record<string, unknown>, status: number, requestId: string) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

function errorResponse(error: unknown, requestId: string) {
  const safe = isVoiceServiceError(error)
    ? error
    : error && typeof error === "object" && "httpStatus" in error && "publicMessage" in error
      ? error as { httpStatus: number; publicMessage: string; code?: string }
      : null;
  if (!safe) console.error(`[voice-transcribe:${requestId}] unexpected error`);
  return json({
    ok: false,
    request_id: requestId,
    error: {
      code: safe && "code" in safe ? String(safe.code || "VOICE_FAILED") : "VOICE_FAILED",
      message: safe?.publicMessage || "智能语音识别暂时不可用，请稍后重试。",
    },
  }, Number(safe?.httpStatus || 500), requestId);
}

function formatFromFile(file: File) {
  const extension = /\.([a-z0-9]{2,5})$/iu.exec(file.name)?.[1]?.toLowerCase();
  return extension || file.type.split("/")[1]?.split(";")[0] || "webm";
}

function parseHotwords(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, 40);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    if (!await currentRequestUser(request)) {
      return json({ ok: false, error: { code: "LOGIN_REQUIRED", message: "请先登录学生课程空间，再使用智能语音。" } }, 401, requestId);
    }
    assertSameOrigin(request);
    enforceVoiceRateLimit(request);
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_AUDIO_BYTES + 512 * 1024) {
      return json({ ok: false, error: { code: "VOICE_AUDIO_TOO_LARGE", message: "单次录音过长，请缩短后重试。" } }, 413, requestId);
    }
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return json({ ok: false, error: { code: "VOICE_AUDIO_EMPTY", message: "没有收到有效录音，请重新录制。" } }, 400, requestId);
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return json({ ok: false, error: { code: "VOICE_AUDIO_TOO_LARGE", message: "单次录音过长，请缩短后重试。" } }, 413, requestId);
    }
    const languageValue = String(form.get("language") || "mixed");
    const language = languageValue === "en" || languageValue === "zh" ? languageValue : "mixed";
    const result = await transcribeVoiceAudio({
      bytes: new Uint8Array(await audio.arrayBuffer()),
      mimeType: audio.type,
      format: formatFromFile(audio),
      context: String(form.get("context") || "").slice(0, 1_000),
      hotwords: parseHotwords(form.get("hotwords")),
      language,
    });
    return json({
      ok: true,
      request_id: requestId,
      ai_processed: true,
      text: result.text,
      duration: result.duration,
    }, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
