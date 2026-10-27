import type { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/step8a/api";
import { currentRequestUser, safeSessionPayload } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentRequestUser(request);
  if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
  return noStoreJson({ ok: true, ...safeSessionPayload(user) });
}
