import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { clearBarrage, liveBarrage, submitBarrage } from "@/lib/step19/store.mjs";
import { readSmallJson, requestId } from "@/lib/step19/http";
import { currentRequestUser, requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SendSchema = z.object({
  classId: z.string().min(1).max(100),
  content: z.string().trim().min(1).max(80),
});

const ClearSchema = z.object({
  id: z.string().uuid().optional(),
  classId: z.string().min(1).max(100).optional(),
}).refine((value) => Boolean(value.id || value.classId), "缺少清除目标。");

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const classId = request.nextUrl.searchParams.get("classId")?.trim() || undefined;
    return noStoreJson({ ok: true, messages: await liveBarrage(classId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
    if (user.role !== "student") return noStoreJson({ ok: false, error: "只有学生账号可以发送匿名弹幕。" }, { status: 403 });
    const parsed = SendSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return noStoreJson({ ok: false, error: "弹幕应为1到80个字符。" }, { status: 400 });
    const message = await submitBarrage(user, parsed.data, requestId(request));
    return noStoreJson({ ok: true, message });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = ClearSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return noStoreJson({ ok: false, error: "清除目标无效。" }, { status: 400 });
    return noStoreJson({ ok: true, ...(await clearBarrage(auth.user, parsed.data, requestId(request))) });
  } catch (error) {
    return jsonError(error);
  }
}
