import type { NextRequest } from "next/server";
import { z } from "zod";
import { streamCourseAnswer } from "@/lib/cloud/ai-service.mjs";
import { assertSameOrigin } from "@/lib/step8a/api";
import { requireRequestRole } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  question: z.string().trim().min(2).max(4_000),
  mode: z.enum(["auto", "terminology", "original", "translation", "explanation", "quiz"]).default("auto"),
  history: z.array(z.unknown()).max(6).optional(),
}).passthrough();

function event(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return Response.json({ ok: false, request_id: requestId, error: { code: auth.status === 401 ? "LOGIN_REQUIRED" : "TEACHER_ONLY", message: "全屏AI数字教师仅在教师工作台开放。" } }, { status: auth.status });
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ ok: false, request_id: requestId, error: { code: "REQUEST_INVALID", message: "问题内容不正确。" } }, { status: 400 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(event(payload)));
        send({ type: "meta", request_id: requestId, renderer: "browser-local-2.5d", cost_mode: "zero-avatar-cost" });
        try {
          for await (const text of streamCourseAnswer(parsed.data, { signal: request.signal })) send({ type: "delta", text });
          send({ type: "done" });
        } catch (error) {
          send({ type: "error", code: "LOCAL_AVATAR_STREAM_FAILED", message: error instanceof Error ? error.message : "AI教师回答暂时不可用。" });
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
    return Response.json({ ok: false, request_id: requestId, error: { code: "LOCAL_AVATAR_STREAM_FAILED", message: error instanceof Error ? error.message : "AI教师回答暂时不可用。" } }, { status: 400 });
  }
}
