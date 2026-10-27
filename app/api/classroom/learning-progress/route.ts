import type { NextRequest } from "next/server";
import { jsonError, noStoreJson } from "@/lib/step8a/api";
import { getStudentLearningProgress, saveLearningAttempt } from "@/lib/step8a/database";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "student");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    return noStoreJson({ ok: true, data: await getStudentLearningProgress(auth.user.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "student");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const body = await request.json();
    if (!body || !["speaking", "career", "translation"].includes(body.moduleType)) {
      return noStoreJson({ ok: false, error: "练习类型无效。" }, { status: 400 });
    }
    if (!Number.isInteger(Number(body.lessonOrdinal)) || Number(body.lessonOrdinal) < 1 || Number(body.lessonOrdinal) > 12) {
      return noStoreJson({ ok: false, error: "课次范围无效。" }, { status: 400 });
    }
    if (!Number.isFinite(Number(body.score))) {
      return noStoreJson({ ok: false, error: "练习得分无效。" }, { status: 400 });
    }
    const result = await saveLearningAttempt(auth.user.id, {
      lessonOrdinal: Number(body.lessonOrdinal),
      moduleType: body.moduleType,
      itemId: String(body.itemId || ""),
      score: Number(body.score),
      responseText: String(body.responseText || ""),
      feedback: String(body.feedback || ""),
    });
    return noStoreJson({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
