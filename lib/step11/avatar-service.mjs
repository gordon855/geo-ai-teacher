import "server-only";

// The public Step 12 build uses LiveAvatar LITE and the browser-rendered
// 2.5D fallback.  The older LingMou/Wanxiang cloud-rendering adapter required
// a Node-only SDK and is intentionally unavailable in the Cloudflare runtime.

export class AvatarServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "AvatarServiceError";
    this.code = code;
    this.httpStatus = Number(options.httpStatus || 503);
    this.publicMessage = options.publicMessage || "旧版云渲染数字人未启用，请使用LiveAvatar真人版或免费2.5D教师。";
  }
}

export function isAvatarServiceError(error) {
  return error instanceof AvatarServiceError;
}

export async function createRealtimeAvatarSession() {
  throw new AvatarServiceError("LEGACY_AVATAR_DISABLED", "LingMou adapter is disabled in Step 12");
}

export async function closeRealtimeAvatarSession() {
  return { closed: true };
}
