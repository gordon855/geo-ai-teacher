import type { NextRequest } from "next/server";
import { currentRequestUser } from "@/lib/step8a/session";
import { noStoreJson, jsonError } from "@/lib/step8a/api";
import { listPresentationCatalog, readPresentationAnalysis } from "@/lib/step11-7/presentation-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicPresentation(item: Record<string, unknown>) {
  return {
    originalName: String(item.originalName || ""),
    size: Number(item.size || 0),
    version: String(item.version || ""),
    updatedAt: String(item.updatedAt || ""),
    updatedBy: String(item.updatedBy || ""),
    isCurrent: Boolean(item.isCurrent),
    analysis: item.analysis || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!await currentRequestUser(request)) return noStoreJson({ ok: false, error: "请先登录课程账号。" }, { status: 401 });
    const catalog = await listPresentationCatalog();
    const requested = request.nextUrl.searchParams.get("version") || catalog[0]?.version || "";
    const selected = requested ? await readPresentationAnalysis(requested) : null;
    return noStoreJson({
      ok: true,
      catalog: catalog.map((item) => publicPresentation(item)),
      selected: selected ? { presentation: publicPresentation(selected.presentation), analysis: selected.analysis } : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

