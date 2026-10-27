import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { getRosterDeletionPreview, removeStudentsFromClass } from "@/lib/step8a/database";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DeleteRosterSchema = z.object({
  classId: z.string().min(3).max(80),
  studentUserIds: z.array(z.string().min(3).max(100)).max(500).optional(),
  all: z.boolean().optional().default(false),
  preview: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  const hasStudents = Boolean(value.studentUserIds?.length);
  if (value.all === hasStudents) context.addIssue({ code: "custom", message: "必须在清空名单与删除所选学生之间二选一。" });
});

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = DeleteRosterSchema.safeParse(await request.json());
    if (!parsed.success) return noStoreJson({ ok: false, error: parsed.error.issues[0]?.message || "学生删除参数无效。" }, { status: 400 });
    const ids = parsed.data.all ? undefined : parsed.data.studentUserIds;
    if (parsed.data.preview) return noStoreJson({ ok: true, preview: await getRosterDeletionPreview(parsed.data.classId, ids) });
    if (!parsed.data.confirm) return noStoreJson({ ok: false, error: "删除学生前必须先完成二次确认。" }, { status: 400 });
    return noStoreJson({ ok: true, data: await removeStudentsFromClass(auth.user.id, parsed.data.classId, ids) });
  } catch (error) {
    return jsonError(error);
  }
}
