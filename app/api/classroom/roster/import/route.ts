import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import { DEFAULT_CLASS_ID } from "@/lib/step8a/course-data";
import { importRoster } from "@/lib/step8a/database";
import { credentialsToCsv, parseRosterFile } from "@/lib/step8a/roster";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const form = await request.formData();
    const file = form.get("file");
    const classId = String(form.get("classId") || DEFAULT_CLASS_ID);
    if (!(file instanceof File)) {
      return noStoreJson({ ok: false, error: "请选择名单文件。" }, { status: 400 });
    }
    const rows = await parseRosterFile(file);
    const result = await importRoster(auth.user.id, classId, rows);
    return noStoreJson({
      ok: true,
      created: result.created,
      updated: result.updated,
      enrolled: result.enrolled,
      unchanged: result.unchanged,
      credentialCsv: result.credentials.length ? credentialsToCsv(result.credentials) : "",
      credentialFilename: "学生临时密码_" + new Date().toISOString().slice(0, 10) + ".csv",
      warning: result.credentials.length
        ? "临时密码只在本次响应中提供，请立即下载并妥善保管。"
        : "本次没有创建新账号，因此未生成临时密码。",
    });
  } catch (error) {
    return jsonError(error);
  }
}
