import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import {
  createClass,
  deleteClass,
  getClassDeletionPreview,
  listTeacherClasses,
  updateClassProgress,
} from "@/lib/step8a/database";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateClassSchema = z.object({
  name: z.string().trim().min(2).max(60),
  courseCode: z.string().trim().min(2).max(30),
  term: z.string().trim().min(2).max(60),
});

const UpdateProgressSchema = z.object({
  classId: z.string().min(3).max(80),
  currentLessonOrdinal: z.number().int().min(1).max(12),
});

const DeleteClassSchema = z.object({
  classId: z.string().min(3).max(80),
  preview: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    return noStoreJson({ ok: true, classes: await listTeacherClasses() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = CreateClassSchema.safeParse(await request.json());
    if (!parsed.success) {
      return noStoreJson({ ok: false, error: "请完整填写班级名称、课程代码和学期。" }, { status: 400 });
    }
    return noStoreJson({ ok: true, data: await createClass(auth.user.id, parsed.data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = UpdateProgressSchema.safeParse(await request.json());
    if (!parsed.success) {
      return noStoreJson({ ok: false, error: "班级或当前课次无效。" }, { status: 400 });
    }
    return noStoreJson({
      ok: true,
      data: await updateClassProgress(auth.user.id, parsed.data.classId, parsed.data.currentLessonOrdinal),
    });
  } catch (error) {
    return jsonError(error);
  }
}


export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = DeleteClassSchema.safeParse(await request.json());
    if (!parsed.success) return noStoreJson({ ok: false, error: "班级删除参数无效。" }, { status: 400 });
    if (parsed.data.preview) return noStoreJson({ ok: true, preview: await getClassDeletionPreview(parsed.data.classId) });
    if (!parsed.data.confirm) return noStoreJson({ ok: false, error: "删除班级前必须先完成二次确认。" }, { status: 400 });
    return noStoreJson({ ok: true, data: await deleteClass(auth.user.id, parsed.data.classId) });
  } catch (error) {
    return jsonError(error);
  }
}
