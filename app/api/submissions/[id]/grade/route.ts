import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";
import { gradeSubmission } from "@/lib/step14/assignment-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GradeSchema = z.object({ score: z.number().min(0).max(100), feedback: z.string().max(3_000).optional().default("") }).strict();

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = GradeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, error: "请输入0—100分，并检查批改意见长度。" }, { status: 400 });
    const { id } = await context.params;
    return noStoreJson({ ok: true, result: await gradeSubmission({ submissionId: id, ...parsed.data, teacher: auth.user }) });
  } catch (error) {
    return jsonError(error);
  }
}

