import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, noStoreJson } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";
import { translatePresentationSelection } from "@/lib/cloud/ai-service.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TranslationSchema = z.object({
  selection: z.string().trim().min(1).max(4000),
  sentence: z.string().trim().max(8000).optional().default(""),
  slideNumber: z.number().int().min(1).max(2_000).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const user = await currentRequestUser(request);
    if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
    const parsed = TranslationSchema.safeParse(await request.json());
    if (!parsed.success) return noStoreJson({ ok: false, error: "请选择要翻译的词、短语或完整句子。" }, { status: 400 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    try {
      const translation = await translatePresentationSelection({
        selection: parsed.data.selection,
        sentence: parsed.data.sentence,
        slideNumber: parsed.data.slideNumber,
        signal: controller.signal,
      });
      return noStoreJson({ ok: true, requestId, translation });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return noStoreJson({
      ok: false,
      requestId,
      error: error instanceof Error ? error.message : "PPT翻译暂时不可用，请稍后重试。",
    }, { status: 400 });
  }
}
