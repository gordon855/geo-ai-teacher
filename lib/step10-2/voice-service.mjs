import "server-only";

import { getServiceSettings } from "../cloud/runtime.mjs";
import { buildRecognitionHints } from "./voice-glossary.mjs";

const DEFAULT_ASR_MODEL = "qwen-audio-3.0-asr-flash";
const DEFAULT_TTS_MODEL = "qwen-audio-3.0-tts-plus";
const DEFAULT_TTS_VOICE = "longanlingxin";
const PROVIDER_TIMEOUT_MS = 45_000;

export class VoiceServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "VoiceServiceError";
    this.code = code;
    this.httpStatus = Number(options.httpStatus || 500);
    this.publicMessage = options.publicMessage || "智能语音服务暂时不可用，请稍后重试。";
  }
}

export function isVoiceServiceError(value) {
  return value instanceof VoiceServiceError;
}

function numberInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

export async function resolveVoiceSettings() {
  const cloud = await getServiceSettings();
  if (!cloud.DASHSCOPE_API_KEY) {
    throw new VoiceServiceError("VOICE_NOT_CONFIGURED", "百炼语音密钥尚未配置。", {
      httpStatus: 503,
      publicMessage: "教师尚未配置百炼语音服务；你仍可使用浏览器自带朗读功能。",
    });
  }
  let hostBase = "https://dashscope.aliyuncs.com";
  try {
    if (cloud.BAILIAN_BASE_URL) {
      const parsed = new URL(cloud.BAILIAN_BASE_URL);
      hostBase = `${parsed.protocol}//${parsed.host}`;
    } else if (cloud.BAILIAN_WORKSPACE_ID) {
      hostBase = `https://${cloud.BAILIAN_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com`;
    }
  } catch {
    throw new VoiceServiceError("VOICE_ENDPOINT_INVALID", "百炼服务地址无效。", { httpStatus: 503, publicMessage: "教师端百炼服务地址需要检查。" });
  }
  return {
    apiKey: cloud.DASHSCOPE_API_KEY,
    nativeBaseUrl: `${hostBase}/api/v1`,
    asrModel: String(cloud.VOICE_ASR_MODEL || DEFAULT_ASR_MODEL).trim(),
    ttsModel: String(cloud.VOICE_TTS_MODEL || DEFAULT_TTS_MODEL).trim(),
    ttsVoice: String(cloud.VOICE_TTS_VOICE || DEFAULT_TTS_VOICE).trim(),
    ttsRate: numberInRange(cloud.VOICE_TTS_RATE, 0.95, 0.5, 2),
  };
}

function providerFailure(status, body, cause) {
  const code = String(body?.code || body?.Code || body?.error?.code || "");
  if (status === 401 || status === 403 || /AccessDenied|InvalidApiKey|Unauthorized/i.test(code)) {
    return new VoiceServiceError("VOICE_ACCESS_DENIED", "百炼拒绝语音模型访问。", {
      cause,
      httpStatus: 503,
      publicMessage: "语音模型尚未授权，或当前百炼密钥无权访问该模型。",
    });
  }
  if (status === 429) {
    return new VoiceServiceError("VOICE_RATE_LIMITED", "百炼语音模型限流。", {
      cause,
      httpStatus: 429,
      publicMessage: "当前使用语音的同学较多，请稍后再试。",
    });
  }
  return new VoiceServiceError("VOICE_PROVIDER_FAILED", `百炼语音请求失败：${status || "network"}`, {
    cause,
    httpStatus: status >= 500 ? 503 : 502,
    publicMessage: "智能语音服务本次请求未完成，请稍后重试。",
  });
}

async function postProviderJson(url, apiKey, body, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || PROVIDER_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-SSE": "disable",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    if (!response.ok) throw providerFailure(response.status, data);
    return data;
  } catch (error) {
    if (error instanceof VoiceServiceError) throw error;
    const timedOut = controller.signal.aborted;
    throw new VoiceServiceError(timedOut ? "VOICE_TIMEOUT" : "VOICE_NETWORK_ERROR", "百炼语音网络请求失败。", {
      cause: error,
      httpStatus: timedOut ? 504 : 503,
      publicMessage: timedOut ? "语音处理等待时间过长，请重试。" : "暂时无法连接智能语音服务，请稍后重试。",
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

function normalizeAudioFormat(format, mimeType) {
  const requested = String(format || "").toLowerCase().replace(/[^a-z0-9]/gu, "");
  const supported = new Set(["aac", "amr", "flac", "m4a", "mp3", "mp4", "mpeg", "ogg", "opus", "wav", "webm", "wma"]);
  if (supported.has(requested)) return requested;
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

function normalizeAudioMime(mimeType, format) {
  const mime = String(mimeType || "").split(";")[0].trim().toLowerCase();
  if (mime.startsWith("audio/")) return mime;
  const byFormat = { webm: "audio/webm", ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg", mp4: "audio/mp4", opus: "audio/opus" };
  return byFormat[format] || "audio/webm";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function transcribeVoiceAudio(input, options = {}) {
  const settings = options.settings || await resolveVoiceSettings();
  const bytes = input?.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input?.bytes || []);
  if (!bytes.length) {
    throw new VoiceServiceError("VOICE_AUDIO_EMPTY", "录音为空。", { httpStatus: 400, publicMessage: "没有收到有效录音，请重新录制。" });
  }
  if (bytes.byteLength > 8 * 1024 * 1024) {
    throw new VoiceServiceError("VOICE_AUDIO_TOO_LARGE", "录音超过限制。", { httpStatus: 413, publicMessage: "单次录音过长，请控制在5分钟以内后重试。" });
  }
  const format = normalizeAudioFormat(input.format, input.mimeType);
  const mimeType = normalizeAudioMime(input.mimeType, format);
  const hints = buildRecognitionHints({ context: input.context, hotwords: input.hotwords, language: input.language });
  const messages = [];
  if (hints.contextText) {
    messages.push({ role: "user", content: [{ type: "input_text", text: hints.contextText }] });
  }
  messages.push({
    role: "user",
    content: [{
      type: "input_audio",
      input_audio: { data: `data:${mimeType};base64,${bytesToBase64(bytes)}` },
    }],
  });
  const data = await postProviderJson(
    `${settings.nativeBaseUrl}/services/aigc/multimodal-generation/generation`,
    settings.apiKey,
    {
      model: settings.asrModel,
      input: { messages },
      parameters: {
        format,
        vocabulary: hints.vocabulary,
        language_hints: hints.languageHints,
      },
    },
    options,
  );
  const text = String(data?.output?.text || "").trim();
  if (!text) {
    throw new VoiceServiceError("VOICE_TRANSCRIPT_EMPTY", "语音识别结果为空。", { httpStatus: 422, publicMessage: "没有识别到清晰语音，请靠近麦克风后重试。" });
  }
  return { text, duration: Number(data?.usage?.duration || 0), model: settings.asrModel };
}

export function normalizeSpeechText(value) {
  return String(value || "")
    .replace(/\[S\d+\]/gu, "")
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/[`*_#>|]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export async function synthesizeTeacherSpeech(input, options = {}) {
  const settings = options.settings || await resolveVoiceSettings();
  const text = normalizeSpeechText(input?.text);
  if (!text) {
    throw new VoiceServiceError("VOICE_TEXT_EMPTY", "朗读文本为空。", { httpStatus: 400, publicMessage: "没有可朗读的内容。" });
  }
  if (text.length > 3_500) {
    throw new VoiceServiceError("VOICE_TEXT_TOO_LONG", "朗读文本过长。", { httpStatus: 413, publicMessage: "单段朗读内容过长，请分段播放。" });
  }
  const language = input?.language === "en" ? "en" : input?.language === "zh" ? "zh" : null;
  const rate = numberInRange(input?.rate, settings.ttsRate, 0.5, 2);
  const synthesisInput = {
    text,
    voice: settings.ttsVoice,
    format: "mp3",
    sample_rate: 24_000,
    rate,
    instruction: "知性、耐心、清晰的大学测绘专业英语教师语气；英文专业术语发音准确，中文自然。",
    enable_aigc_tag: true,
  };
  if (language) synthesisInput.language_hints = [language];
  const data = await postProviderJson(
    `${settings.nativeBaseUrl}/services/audio/tts/SpeechSynthesizer`,
    settings.apiKey,
    { model: settings.ttsModel, input: synthesisInput },
    options,
  );
  const url = String(data?.output?.audio?.url || "").trim();
  if (!url) {
    throw new VoiceServiceError("VOICE_AUDIO_MISSING", "百炼未返回合成音频。", { httpStatus: 502, publicMessage: "AI教师语音生成失败，请重试。" });
  }
  return { url, model: settings.ttsModel, voice: settings.ttsVoice, characters: Number(data?.usage?.characters || text.length) };
}

export function assertTrustedAudioUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new VoiceServiceError("VOICE_AUDIO_URL_INVALID", "语音下载地址无效。", { cause: error, httpStatus: 502 });
  }
  const hostAllowed = parsed.hostname === "aliyuncs.com" || parsed.hostname.endsWith(".aliyuncs.com");
  if (!hostAllowed || !["https:", "http:"].includes(parsed.protocol)) {
    throw new VoiceServiceError("VOICE_AUDIO_URL_INVALID", "语音下载地址不属于百炼结果域名。", { httpStatus: 502 });
  }
  return parsed.toString();
}
