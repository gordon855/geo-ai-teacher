import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createCloudQuiz, gradeCloudQuiz, quizCatalog, revealCloudQuiz } from "@/lib/cloud/quiz-service.mjs";
import { assertSameOrigin } from "@/lib/step8a/api";
import { currentRequestUser } from "@/lib/step8a/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QuizSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), unit: z.number().int().min(1).max(99), count: z.union([z.literal(3), z.literal(5), z.literal(10)]), focus: z.enum(["mixed", "vocabulary", "concept"]) }).strict(),
  z.object({ action: z.literal("grade"), quiz_id: z.string().uuid(), answers: z.array(z.object({ question_id: z.string().regex(/^Q\d+$/u), selected_index: z.number().int().min(0).max(3) }).strict()).max(10) }).strict(),
  z.object({ action: z.literal("reveal"), quiz_id: z.string().uuid() }).strict(),
]);

function reply(body: Record<string, unknown>, status: number, requestId: string) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const user = await currentRequestUser(request);
  if (!user) return reply({ ok: false, request_id: requestId, error: { code: "LOGIN_REQUIRED", message: "请先登录课程账号，再使用章节测试。" } }, 401, requestId);
  return reply({ ok: true, request_id: requestId, ...quizCatalog() }, 200, requestId);
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const user = await currentRequestUser(request);
    if (!user) return reply({ ok: false, request_id: requestId, error: { code: "LOGIN_REQUIRED", message: "请先登录课程账号，再使用章节测试。" } }, 401, requestId);
    const parsed = QuizSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ ok: false, request_id: requestId, error: { code: "QUIZ_REQUEST_INVALID", message: "Unit、题量、题型或答案格式不正确。" } }, 400, requestId);
    const input = parsed.data;
    if (input.action === "generate") {
      const quiz = await createCloudQuiz(user.id, input, request.signal);
      return reply({ ok: true, request_id: requestId, ai_generated: true, status: "quiz_ready", ...quiz }, 200, requestId);
    }
    const result = input.action === "grade" ? await gradeCloudQuiz(user.id, input) : await revealCloudQuiz(user.id, input);
    return reply({ ok: true, request_id: requestId, ai_generated: false, status: input.action === "grade" ? "graded" : "revealed", ...result }, 200, requestId);
  } catch (error) {
    return reply({ ok: false, request_id: requestId, error: { code: "QUIZ_FAILED", message: error instanceof Error ? error.message : "章节测试服务暂时不可用。" } }, 400, requestId);
  }
}
