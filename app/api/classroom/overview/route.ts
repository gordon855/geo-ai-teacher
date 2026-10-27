import type { NextRequest } from "next/server";
import { jsonError, noStoreJson } from "@/lib/step8a/api";
import { getTeacherOverview } from "@/lib/step8a/database";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const classId = request.nextUrl.searchParams.get("classId") || undefined;
    return noStoreJson({ ok: true, data: await getTeacherOverview(classId) });
  } catch (error) {
    return jsonError(error);
  }
}
