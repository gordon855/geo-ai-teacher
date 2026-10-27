import { ensureClassroomReady } from "@/lib/step8a/database";
import { noStoreJson } from "@/lib/step8a/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await ensureClassroomReady();
  return noStoreJson({
    ok: true,
    configured: status.configured,
    message: status.configured ? "班级管理服务已配置。" : status.error,
  });
}

