import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store, max-age=0");
  return result;
}

export async function GET() {
  return response({ ok: true, avatar: { configured: false, provider: "legacy-disabled" }, capacity: { active: 0, limit: 0 }, fallback_voice: true });
}

export async function POST() {
  return response({ ok: false, fallback_voice: true, error: { code: "LEGACY_AVATAR_DISABLED", message: "大陆第15版已改用免费的2.5D教师或LiveAvatar LITE真人教师。" } }, 503);
}

export async function DELETE() {
  return response({ ok: true });
}
