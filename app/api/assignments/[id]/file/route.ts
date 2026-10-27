import type { NextRequest } from "next/server";
import { currentRequestUser } from "@/lib/step8a/session";
import { DOCX_CONTENT_TYPE, readAssignmentFile } from "@/lib/step14/assignment-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await currentRequestUser(request);
  if (!user) return Response.json({ ok: false, error: "请先登录。" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const file = await readAssignmentFile(id, user);
  if (!file) return Response.json({ ok: false, error: "作业附件不存在或无权访问。" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(file.bytes, { headers: {
    "Content-Type": DOCX_CONTENT_TYPE,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "Content-Length": String(file.size),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}

