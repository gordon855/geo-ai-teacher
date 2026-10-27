import { event, securityPool } from "@/lib/step19/store.mjs";
import { requestId } from "@/lib/step19/http";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  assertLoginAllowed,
  assertSameOrigin,
  clearLoginFailures,
  jsonError,
  recordLoginFailure,
  requestClientKey,
} from "@/lib/step8a/api";
import { authenticateUser, ensureClassroomReady } from "@/lib/step8a/database";
import { attachSessionCookie, safeSessionPayload } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(1).max(128),
  expectedRole: z.enum(["teacher", "student"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const status = await ensureClassroomReady();
    if (!status.configured) {
      return NextResponse.json({ ok: false, error: status.error }, { status: 503 });
    }
    const parsed = LoginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "请输入正确的账号和密码。" }, { status: 400 });
    }
    const key = requestClientKey(request, parsed.data.username);
    assertLoginAllowed(key);
    const user = await authenticateUser(parsed.data.username, parsed.data.password);
    if (!user || (parsed.data.expectedRole && user.role !== parsed.data.expectedRole)) {
      recordLoginFailure(key);
      return NextResponse.json({ ok: false, error: "账号或密码不正确。" }, { status: 401 });
    }
    await event(securityPool(), user.id, "login_success", user.id, { username:user.username }, requestId(request));
    clearLoginFailures(key);
    const response = NextResponse.json({ ok: true, ...safeSessionPayload(user) });
    response.headers.set("Cache-Control", "no-store");
    await attachSessionCookie(response, user.id, request.headers.get("user-agent") || "");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
