import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError } from "@/lib/step8a/api";
import { changeUserPassword } from "@/lib/step8a/database";
import { attachSessionCookie, currentRequestUser } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await currentRequestUser(request);
    if (!user) return NextResponse.json({ ok: false, error: "请先登录。" }, { status: 401 });
    const parsed = PasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "新密码格式不符合要求。" }, { status: 400 });
    }
    const result = await changeUserPassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    const response = NextResponse.json({ ok: true });
    await attachSessionCookie(response, user.id, request.headers.get("user-agent") || "");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
