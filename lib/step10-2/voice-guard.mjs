import "server-only";

import { VoiceServiceError } from "./voice-service.mjs";

const VOICE_GUARD_SYMBOL = Symbol.for("surveying-ai-teacher.step10-2.voice-guard");
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 36;
const MAX_REQUESTS_PER_CLIENT_WINDOW = 72;

function state() {
  if (!globalThis[VOICE_GUARD_SYMBOL]) globalThis[VOICE_GUARD_SYMBOL] = new Map();
  return globalThis[VOICE_GUARD_SYMBOL];
}

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

function fingerprint(request) {
  const address = firstHeaderValue(
    request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local",
  );
  const suppliedClientId = String(request.headers.get("x-voice-client-id") || "").trim();
  const clientId = /^voice-[a-z0-9-]{8,58}$/iu.test(suppliedClientId) ? suppliedClientId : "";
  return {
    key: (clientId ? `${address}|${clientId}` : address).slice(0, 180),
    limit: clientId ? MAX_REQUESTS_PER_CLIENT_WINDOW : MAX_REQUESTS_PER_WINDOW,
  };
}

export function enforceVoiceRateLimit(request) {
  const entries = state();
  const now = Date.now();
  const { key, limit } = fingerprint(request);
  const current = entries.get(key);
  if (!current || now >= current.resetAt) {
    entries.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > limit) {
      throw new VoiceServiceError("VOICE_RATE_LIMITED", "客户端语音请求过于频繁。", {
        httpStatus: 429,
        publicMessage: "语音操作过于频繁，请稍后再试。",
      });
    }
  }
  if (entries.size > 1_000) {
    for (const [entryKey, entry] of entries) {
      if (now >= entry.resetAt) entries.delete(entryKey);
    }
  }
}

export function resetVoiceGuardForTests() {
  state().clear();
}
