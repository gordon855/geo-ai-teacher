import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";
import { autoGradeSubmission } from "@/lib/step14/assignment-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 80_000);
    try {
      const result = await autoGradeSubmission({ submissionId: id, teacher: auth.user, signal: controller.signal });
      return noStoreJson({ ok: true, result });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return jsonError(error);
  }
}
