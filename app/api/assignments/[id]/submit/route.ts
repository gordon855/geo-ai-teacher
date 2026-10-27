import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";
import { MAX_WORD_BYTES, submitAssignment } from "@/lib/step14/assignment-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "student");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return noStoreJson({ ok: false, error: "请选择要提交的Word .docx作业。" }, { status: 400 });
    if (file.size > MAX_WORD_BYTES) return noStoreJson({ ok: false, error: "学生作业Word文件不能超过20MB。" }, { status: 413 });
    const { id } = await context.params;
    const submission = await submitAssignment({ assignmentId: id, student: auth.user, bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name });
    return noStoreJson({ ok: true, submission, gradingError: submission.gradingError || "" });
  } catch (error) {
    return jsonError(error);
  }
}
