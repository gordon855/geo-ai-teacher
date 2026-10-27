import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { currentRequestUser, requireRequestRole } from "@/lib/step8a/session";
import { createAssignment, listStudentAssignments, listTeacherAssignments, MAX_WORD_BYTES } from "@/lib/step14/assignment-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录课程账号。" }, { status: 401 });
    if (user.role === "student") return noStoreJson({ ok: true, assignments: await listStudentAssignments(user.id) });
    const classId = request.nextUrl.searchParams.get("classId") || "";
    if (!classId) return noStoreJson({ ok: false, error: "请选择班级后查看作业。" }, { status: 400 });
    return noStoreJson({ ok: true, assignments: await listTeacherAssignments(classId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const form = await request.formData();
    const classId = String(form.get("classId") || "").trim();
    const title = String(form.get("title") || "").trim();
    const instructions = String(form.get("instructions") || "").trim();
    const dueAtRaw = String(form.get("dueAt") || "").trim();
    if (!classId) return noStoreJson({ ok: false, error: "请选择发布作业的班级。" }, { status: 400 });
    if (title.length < 2 || title.length > 160) return noStoreJson({ ok: false, error: "作业标题应为2—160个字符。" }, { status: 400 });
    if (instructions.length > 5_000) return noStoreJson({ ok: false, error: "作业要求不能超过5000个字符。" }, { status: 400 });
    const dueDate = dueAtRaw ? new Date(dueAtRaw) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) return noStoreJson({ ok: false, error: "截止时间格式无效。" }, { status: 400 });
    const dueAt = dueDate ? dueDate.toISOString() : null;
    const uploaded = form.get("file");
    const file = uploaded instanceof File && uploaded.size ? uploaded : null;
    if (file && file.size > MAX_WORD_BYTES) return noStoreJson({ ok: false, error: "教师作业Word文件不能超过20MB。" }, { status: 413 });
    const assignment = await createAssignment({
      classId,
      taskModule: ["literature","terms"].includes(String(form.get("taskModule"))) ? String(form.get("taskModule")) : "homework",
      title,
      instructions,
      dueAt,
      file: file ? { bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name } : null,
      teacher: auth.user,
    });
    return noStoreJson({ ok: true, assignment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
