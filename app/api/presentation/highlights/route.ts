import type { NextRequest } from "next/server";
import { currentRequestUser } from "@/lib/step8a/session";
import { jsonError, noStoreJson } from "@/lib/step8a/api";
import { readPresentationAnalysis } from "@/lib/step11-7/presentation-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!await currentRequestUser(request)) return noStoreJson({ ok: false, error: "请先登录课程账号。" }, { status: 401 });
    const version = String(request.nextUrl.searchParams.get("version") || "").trim();
    const slideNumber = Number(request.nextUrl.searchParams.get("slideNumber"));
    if (!/^[a-f0-9]{16}$/iu.test(version) || !Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > 2_000) {
      return noStoreJson({ ok: false, error: "PPT版本或页码无效。" }, { status: 400 });
    }
    const record = await readPresentationAnalysis(version);
    if (!record || !record.presentation.isCurrent) {
      return noStoreJson({ ok: false, error: "当前PPT已经更新，请刷新后重试。" }, { status: 404 });
    }
    const slides = Array.isArray(record.analysis?.slides) ? record.analysis.slides : [];
    const slide = slides.find((item: Record<string, unknown>) => Number(item?.slideNumber) === slideNumber);
    const terms = (Array.isArray(slide?.terms) ? slide.terms : []).slice(0, 100).map((item: Record<string, unknown>) => ({
      term: String(item?.term || "").slice(0, 100),
      surveyingTranslation: String(item?.surveyingTranslation || "").slice(0, 160),
    })).filter((item: { term: string }) => item.term.length >= 2);
    return noStoreJson({ ok: true, version, slideNumber, terms });
  } catch (error) {
    return jsonError(error);
  }
}
