import "server-only";

import { ensureSchema } from "../step8a/database";

const SECRET_KEYS = new Set([
  "DASHSCOPE_API_KEY",
  "DEEPSEEK_API_KEY",
  "LIVEAVATAR_API_KEY",
]);

const ALLOWED_KEYS = new Set([
  ...SECRET_KEYS,
  "BAILIAN_WORKSPACE_ID",
  "BAILIAN_BASE_URL",
  "KB_CHAT_MODEL",
  "AI_PROVIDER",
  "DEEPSEEK_MODEL",
  "LIVEAVATAR_DEFAULT_AVATAR_ID",
  "VOICE_ASR_MODEL",
  "VOICE_TTS_MODEL",
  "VOICE_TTS_VOICE",
  "VOICE_TTS_RATE",
]);

export function runtimeEnv() {
  return globalThis.__SURVEYING_RUNTIME_ENV__ || {};
}

export function runtimeValue(key) {
  return String(runtimeEnv()[key] ?? process.env[key] ?? "").trim();
}

export function runtimeDb() {
  const db = runtimeEnv().DB;
  if (!db) throw new Error("公网数据库尚未连接。");
  return db;
}

export function runtimeBucket() {
  const bucket = runtimeEnv().BUCKET;
  if (!bucket) throw new Error("公网文件存储尚未连接。");
  return bucket;
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

async function encryptionKey() {
  const raw = decodeBase64Url(runtimeValue("APP_ENCRYPTION_KEY"));
  if (raw.length !== 32) throw new Error("公网密钥加密服务尚未完成初始化。");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(cipher))}`;
}

async function decryptSecret(value) {
  const [version, ivValue, cipherValue] = String(value || "").split(".");
  if (version !== "v1" || !ivValue || !cipherValue) throw new Error("加密配置格式无效。");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivValue) },
    await encryptionKey(),
    decodeBase64Url(cipherValue),
  );
  return new TextDecoder().decode(plain);
}

export async function readStoredServiceSettings() {
  await ensureSchema();
  const result = await runtimeDb().prepare("SELECT key,value,encrypted FROM app_settings").all();
  const settings = {};
  for (const row of result.results || []) {
    if (!ALLOWED_KEYS.has(String(row.key))) continue;
    try {
      settings[row.key] = Number(row.encrypted) ? await decryptSecret(String(row.value)) : String(row.value);
    } catch {
      // A rotated encryption key deliberately makes old secrets unavailable.
    }
  }
  return settings;
}

/** @returns {Promise<Record<string, string>>} */
export async function getServiceSettings() {
  const stored = await readStoredServiceSettings();
  const settings = {};
  for (const key of ALLOWED_KEYS) settings[key] = String(stored[key] ?? runtimeValue(key) ?? "").trim();
  settings.AI_PROVIDER ||= settings.DEEPSEEK_API_KEY ? "deepseek" : "bailian";
  settings.KB_CHAT_MODEL ||= "qwen-plus";
  settings.DEEPSEEK_MODEL ||= "deepseek-chat";
  settings.VOICE_ASR_MODEL ||= "qwen-audio-3.0-asr-flash";
  settings.VOICE_TTS_MODEL ||= "qwen-audio-3.0-tts-plus";
  settings.VOICE_TTS_VOICE ||= "longanlingxin";
  settings.VOICE_TTS_RATE ||= "0.95";
  return settings;
}

export async function getServiceConfigurationStatus() {
  const settings = await getServiceSettings();
  return {
    knowledgeBase: true,
    bailian: Boolean(settings.DASHSCOPE_API_KEY),
    bailianWorkspace: Boolean(settings.BAILIAN_WORKSPACE_ID || settings.BAILIAN_BASE_URL),
    deepseek: Boolean(settings.DEEPSEEK_API_KEY),
    liveavatar: Boolean(settings.LIVEAVATAR_API_KEY),
    defaultAvatar: Boolean(settings.LIVEAVATAR_DEFAULT_AVATAR_ID),
    voice: Boolean(settings.DASHSCOPE_API_KEY),
    aiProvider: settings.AI_PROVIDER,
    chatModel: settings.AI_PROVIDER === "deepseek" ? settings.DEEPSEEK_MODEL : settings.KB_CHAT_MODEL,
  };
}

export async function saveServiceSettings(actorUserId, values) {
  await ensureSchema();
  const now = new Date().toISOString();
  const statements = [];
  for (const [key, rawValue] of Object.entries(values || {})) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const value = String(rawValue ?? "").trim();
    if (!value) continue;
    const encrypted = SECRET_KEYS.has(key) ? 1 : 0;
    statements.push(runtimeDb().prepare(
      "INSERT INTO app_settings (key,value,encrypted,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,encrypted=excluded.encrypted,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).bind(key, encrypted ? await encryptSecret(value) : value, encrypted, actorUserId, now));
  }
  if (statements.length) await runtimeDb().batch(statements);
  return getServiceConfigurationStatus();
}

export async function clearServiceSetting(actorUserId, key) {
  if (!ALLOWED_KEYS.has(key)) throw new Error("配置项无效。");
  await ensureSchema();
  await runtimeDb().prepare("DELETE FROM app_settings WHERE key=?").bind(key).run();
  await runtimeDb().prepare(
    "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), actorUserId, "clear_service_setting", "app_setting", key, "清除云服务配置：" + key, new Date().toISOString()).run();
  return getServiceConfigurationStatus();
}
