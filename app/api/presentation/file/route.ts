import type { NextRequest } from "next/server";
import { currentRequestUser } from "@/lib/step8a/session";
import { readCurrentPresentation } from "@/lib/step11-7/presentation-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentRequestUser(request);
  if (!user) return Response.json({ ok: false, error: "请先登录。" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const presentation = await readCurrentPresentation();
  if (!presentation) {
    return Response.json({ ok: false, error: "教师尚未上传课堂PPT。" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const requestedVersion = request.nextUrl.searchParams.get("v");
  if (requestedVersion && requestedVersion !== presentation.metadata.version) {
    return Response.json({ ok: false, error: "当前课件已切换，请重新加载。" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(new Uint8Array(presentation.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(presentation.metadata.originalName)}`,
      "Content-Length": String(presentation.bytes.length),
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Presentation-Version": presentation.metadata.version,
    },
  });
}
