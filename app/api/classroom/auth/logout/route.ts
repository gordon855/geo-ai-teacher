import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/step8a/api";
import { CLASSROOM_SESSION_COOKIE, clearSessionCookie } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    await clearSessionCookie(response, request.cookies.get(CLASSROOM_SESSION_COOKIE)?.value);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
