import type { NextRequest } from "next/server";
import { z } from "zod";
import { StudentIdSchema } from "@/lib/step8a/student-id";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { getAttendance, saveAttendance } from "@/lib/step8a/database";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AttendanceSchema = z.object({
  classId: z.string().min(1).max(100),
  lessonId: z.string().min(1).max(150),
  entries: z.array(z.object({
    studentUserId: StudentIdSchema,
    status: z.enum(["present", "late", "leave", "absent"]),
    note: z.string().max(200).optional(),
  })).max(500),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const classId = request.nextUrl.searchParams.get("classId") || "";
    const lessonId = request.nextUrl.searchParams.get("lessonId") || "";
    if (!classId || !lessonId) return noStoreJson({ ok: false, error: "缺少班级或课次参数。" }, { status: 400 });
    return noStoreJson({ ok: true, entries: await getAttendance(classId, lessonId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = AttendanceSchema.safeParse(await request.json());
    if (!parsed.success) return noStoreJson({ ok: false, error: "点名数据格式无效。" }, { status: 400 });
    const entries = await saveAttendance(auth.user.id, parsed.data.classId, parsed.data.lessonId, parsed.data.entries);
    return noStoreJson({ ok: true, entries });
  } catch (error) {
    return jsonError(error);
  }
}
