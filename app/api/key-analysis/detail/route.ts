import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, noStoreJson } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";
import { readPresentationAnalysis } from "@/lib/step11-7/presentation-store.mjs";
import { analyzeProfessionalTerm, analyzeUnderlineSentence } from "@/lib/step14/key-analysis.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DetailSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{16}$/u),
  kind: z.enum(["sentence", "term"]),
  itemId: z.string().min(3).max(180),
}).strict();

type AnalysisItem = { id: string; slideNumber: number; [key: string]: unknown };
type AnalysisSlide = { slideNumber: number; underlines?: AnalysisItem[]; [key: string]: unknown };

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    if (!await currentRequestUser(request)) return noStoreJson({ ok: false, requestId, error: "请先登录课程账号。" }, { status: 401 });
    const parsed = DetailSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ ok: false, requestId, error: "重点解析项目无效，请刷新目录后重试。" }, { status: 400 });
    const record = await readPresentationAnalysis(parsed.data.version);
    if (!record?.analysis) return noStoreJson({ ok: false, requestId, error: "这份PPT尚未生成重点解析目录，请教师重新上传。" }, { status: 404 });
    const slides: AnalysisSlide[] = Array.isArray(record.analysis.slides) ? record.analysis.slides : [];
    let item: AnalysisItem | null = null;
    let slide: AnalysisSlide | null = null;
    if (parsed.data.kind === "term") {
      const terms: AnalysisItem[] = Array.isArray(record.analysis.terms) ? record.analysis.terms : [];
      item = terms.find((entry) => entry.id === parsed.data.itemId) || null;
      slide = slides.find((entry) => entry.slideNumber === item?.slideNumber) || null;
    } else {
      for (const candidate of slides) {
        const underlines: AnalysisItem[] = Array.isArray(candidate.underlines) ? candidate.underlines : [];
        const found = underlines.find((entry) => entry.id === parsed.data.itemId);
        if (found) { item = found; slide = candidate; break; }
      }
    }
    if (!item) return noStoreJson({ ok: false, requestId, error: "该重点项目已更新，请刷新PPT目录。" }, { status: 404 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    try {
      const detail = parsed.data.kind === "term"
        ? await analyzeProfessionalTerm(item, slide, { signal: controller.signal })
        : await analyzeUnderlineSentence(item, slide, { signal: controller.signal });
      return noStoreJson({ ok: true, requestId, detail });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return noStoreJson({ ok: false, requestId, error: error instanceof Error ? error.message : "重点解析暂时不可用。" }, { status: 400 });
  }
}
