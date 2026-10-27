import type { NextRequest } from "next/server";
import { jsonError, noStoreJson } from "@/lib/step8a/api";
import { getStudentOverview } from "@/lib/step8a/database";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRequestRole(request, "student");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    return noStoreJson({ ok: true, data: await getStudentOverview(auth.user.id), user: auth.user });
  } catch (error) {
    return jsonError(error);
  }
}
