import "server-only";

export class AvatarConfigError extends Error {
  constructor(code, message, publicMessage = message) {
    super(message);
    this.name = "AvatarConfigError";
    this.code = code;
    this.httpStatus = 503;
    this.publicMessage = publicMessage;
  }
}

function text(value) {
  return String(value || "").trim();
}

function flag(value, fallback = false) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function resolveAvatarSettings(env = process.env) {
  const designedCapacity = integer(env.AVATAR_DESIGN_CAPACITY, 70, 1, 70);
  const activeLimit = Math.min(
    designedCapacity,
    integer(env.AVATAR_ACTIVE_LIMIT, 1, 1, 70),
  );
  const projectId = text(env.AVATAR_PROJECT_ID);
  const instanceId = text(env.AVATAR_INSTANCE_ID);
  const accessKeyId = text(env.ALIBABA_CLOUD_ACCESS_KEY_ID);
  const accessKeySecret = text(env.ALIBABA_CLOUD_ACCESS_KEY_SECRET);
  const enabled = flag(env.AVATAR_ENABLED, false);
  return {
    enabled,
    configured: Boolean(enabled && projectId && instanceId && accessKeyId && accessKeySecret),
    projectId,
    instanceId,
    accessKeyId,
    accessKeySecret,
    endpoint: text(env.AVATAR_LINGMOU_ENDPOINT) || "lingmou.cn-beijing.aliyuncs.com",
    regionId: text(env.AVATAR_REGION_ID) || "cn-beijing",
    designedCapacity,
    activeLimit,
    sessionTtlMs: integer(env.AVATAR_SESSION_TTL_MS, 30 * 60 * 1000, 5 * 60 * 1000, 2 * 60 * 60 * 1000),
    modelApiKey: text(env.AVATAR_MODEL_API_KEY),
    modelEndpointConfigured: text(env.AVATAR_MODEL_API_KEY).length >= 24,
  };
}

export function assertAvatarConfigured(settings = resolveAvatarSettings()) {
  if (!settings.enabled) {
    throw new AvatarConfigError(
      "AVATAR_DISABLED",
      "实时数字教师尚未启用。",
      "实时数字教师尚未启用；您仍可使用低延迟语音问答。",
    );
  }
  const missing = [];
  if (!settings.projectId) missing.push("AVATAR_PROJECT_ID");
  if (!settings.instanceId) missing.push("AVATAR_INSTANCE_ID");
  if (!settings.accessKeyId) missing.push("ALIBABA_CLOUD_ACCESS_KEY_ID");
  if (!settings.accessKeySecret) missing.push("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  if (missing.length) {
    throw new AvatarConfigError(
      "AVATAR_CONFIGURATION_INCOMPLETE",
      `实时数字教师配置缺少：${missing.join(", ")}`,
      "实时数字教师的阿里云会话参数尚未配置完整；您仍可使用低延迟语音问答。",
    );
  }
  return settings;
}

export function publicAvatarStatus(settings = resolveAvatarSettings()) {
  return {
    enabled: settings.enabled,
    configured: settings.configured,
    model_endpoint_configured: settings.modelEndpointConfigured,
    active_limit: settings.activeLimit,
    designed_capacity: settings.designedCapacity,
    provider: "Alibaba Cloud Wanxiang Digital Human",
    sdk: "lm-avatar-chat-sdk",
  };
}
