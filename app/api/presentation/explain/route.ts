import type { NextRequest } from "next/server";
import { z } from "zod";
import { prepareSlideLecture, streamSlideLecture } from "@/lib/cloud/ai-service.mjs";
import { assertSameOrigin } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";
import { readCurrentPresentation } from "@/lib/step11-7/presentation-store.mjs";
import { extractPptxSlide } from "@/lib/step11-9/pptx-slide-text.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LectureSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{16}$/u),
  slideNumber: z.number().int().min(1).max(2_000),
  followUp: z.string().trim().min(2).max(900).optional(),
}).strict();

function event(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function failure(requestId: string, code: string, message: string, status = 400) {
  return Response.json({ ok: false, request_id: requestId, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return failure(requestId, auth.status === 401 ? "LOGIN_REQUIRED" : "TEACHER_ONLY", "课堂PPT深度讲解仅在教师工作台开放。", auth.status);
    const parsed = LectureSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return failure(requestId, "PRESENTATION_LECTURE_REQUEST_INVALID", "当前PPT页信息不完整，请返回PPT重新打开。", 400);
    const current = await readCurrentPresentation();
    if (!current) return failure(requestId, "PRESENTATION_NOT_FOUND", "教师尚未发布课堂PPT。", 404);
    if (current.metadata.version !== parsed.data.version) return failure(requestId, "PRESENTATION_VERSION_CHANGED", "教师刚刚更换了PPT，请刷新后重试。", 409);
    const slide = extractPptxSlide(current.bytes, parsed.data.slideNumber);
    const prepared = await prepareSlideLecture({ presentation: current.metadata, slide, followUp: parsed.data.followUp || "" });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(event(payload)));
        send({
          type: "meta",
          request_id: requestId,
          lecture: {
            presentationName: current.metadata.originalName,
            version: current.metadata.version,
            slideNumber: slide.number,
            slideCount: slide.count,
            slideTitle: slide.title,
            slideText: slide.text,
            extractedCharacters: slide.text.length,
            visualDescriptions: slide.visualDescriptions,
            citations: prepared.citations,
            textbookGlossaryMatches: prepared.glossary.length,
            followUp: Boolean(parsed.data.followUp),
          },
        });
        try {
          for await (const text of streamSlideLecture(prepared, { signal: request.signal })) send({ type: "delta", text });
          send({ type: "done" });
        } catch (error) {
          send({ type: "error", code: "PRESENTATION_LECTURE_FAILED", message: error instanceof Error ? error.message : "PPT本页讲解暂时不可用。" });
        } finally {
          try { controller.close(); } catch { /* Browser already closed. */ }
        }
      },
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-AI-Generated": "true",
      "X-Request-Id": requestId,
    } });
  } catch (error) {
    return failure(requestId, "PRESENTATION_LECTURE_FAILED", error instanceof Error ? error.message : "PPT本页讲解暂时不可用。", 400);
  }
}
