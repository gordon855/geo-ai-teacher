import type { NextRequest } from "next/server";
import { z } from "zod";
import { StudentIdSchema } from "@/lib/step8a/student-id";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { getGradebook, updateGrade } from "@/lib/step8a/database";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GradeSchema = z.object({
  classId: z.string().min(1).max(100),
  studentUserId: StudentIdSchema,
  category: z.enum(["homework", "seminar", "practice", "final_project"]),
  rawScore: z.number().min(0).max(100),
  note: z.string().max(300).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const classId = request.nextUrl.searchParams.get("classId") || "";
    if (!classId) return noStoreJson({ ok: false, error: "缺少班级参数。" }, { status: 400 });
    return noStoreJson({ ok: true, rows: await getGradebook(classId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = GradeSchema.safeParse(await request.json());
    if (!parsed.success) return noStoreJson({ ok: false, error: "成绩数据格式无效。" }, { status: 400 });
    await updateGrade({ actorUserId: auth.user.id, ...parsed.data });
    return noStoreJson({ ok: true, rows: await getGradebook(parsed.data.classId) });
  } catch (error) {
    return jsonError(error);
  }
}
