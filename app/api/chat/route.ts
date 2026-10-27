import { chatResult } from "@/lib/step20-1/chat-result.mjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { answerCourseQuestion } from "@/lib/cloud/ai-service.mjs";
import { assertSameOrigin } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ChatSchema = z.object({
  question: z.string().trim().min(2).max(4_000),
  mode: z.enum(["auto", "terminology", "original", "translation", "explanation", "quiz"]).default("auto"),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1_200),
  }).strict()).max(6).optional().default([]),
}).strict();

function reply(body: Record<string, unknown>, status: number, requestId: string) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    if (!await currentRequestUser(request)) {
      return reply({
        ok: false,
        request_id: requestId,
        error: { code: "LOGIN_REQUIRED", message: "请先通过学生登录或教师登录，再使用AI课程问答。" },
      }, 401, requestId);
    }
    const parsed = ChatSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return reply({ ok: false, request_id: requestId, error: { code: "REQUEST_INVALID", message: "问题内容或问答模式不正确。" } }, 400, requestId);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    if(request.headers.get('accept')?.includes('application/x-ndjson')){
      const encoder=new TextEncoder();
      const stream=new ReadableStream({
        start(output){const send=(value:unknown)=>output.enqueue(encoder.encode(JSON.stringify(value)+'\n'));
          void(async()=>{try{
            send({type:'status',message:'正在检索课程资料'});
            const result=await answerCourseQuestion(parsed.data,{signal:controller.signal,onDelta:(text:string)=>send({type:'delta',text})});
            send({type:'result',payload:chatResult(result,requestId)});
          }catch{try{send({type:'error',message:'回答生成中断或超时，请重新提问。'});}catch{}}
          finally{clearTimeout(timer);try{output.close();}catch{}}})();
        },
        cancel(){controller.abort();clearTimeout(timer);}
      });
      return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Request-Id':requestId}});
    }
    try {
      const result = await answerCourseQuestion(parsed.data, { signal: controller.signal });
      return reply(chatResult(result, requestId), 200, requestId);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error(`[step14-chat:${requestId}]`, error instanceof Error ? error.message : "unknown error");
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return reply({
      ok: false,
      request_id: requestId,
      error: { code: timedOut ? "REQUEST_TIMEOUT" : "CHAT_FAILED", message: timedOut ? "AI回答等待超时，请稍后重试。" : (error instanceof Error ? error.message : "课程问答暂时不可用。") },
    }, timedOut ? 504 : 503, requestId);
  }
}
