import type { NextRequest } from "next/server";
import { z } from "zod";
import { StudentIdSchema } from "@/lib/step8a/student-id";
import { assertSameOrigin, jsonError, noStoreJson } from "@/lib/step8a/api";
import {
  drawColdCall,
  getColdCallEvaluationContext,
  getLatestColdCallBroadcastForUser,
  publishColdCallBroadcast,
  recordColdCallScore,
  revealColdCallAnswer,
  saveColdCallAttempt,
} from "@/lib/step8a/database";
import { currentRequestUser, requireRequestRole } from "@/lib/step8a/session";
import {
  evaluateColdCallAnswer,
  timedOutColdCallEvaluation,
} from "@/lib/step15/cold-call-evaluator.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DrawSchema = z.object({
  action: z.literal("draw"),
  classId: z.string().min(1).max(100),
  lessonId: z.string().min(1).max(150),
  kind: z.enum(["terminology", "syntax", "concept"]).optional(),
});
const RevealSchema = z.object({
  action: z.literal("reveal"),
  questionId: z.string().min(1).max(120),
});
const ScoreSchema = z.object({
  action: z.literal("score"),
  classId: z.string().min(1).max(100),
  lessonId: z.string().min(1).max(150),
  studentUserId: StudentIdSchema,
  questionId: z.string().min(1).max(120),
  score: z.number().min(0).max(10),
  teacherNote: z.string().max(300).optional(),
});
const EvaluateSchema = z.object({
  action: z.literal("evaluate"),
  eventId: z.string().uuid(),
  studentAnswer: z.string().trim().min(1).max(2_000),
});
const TimeoutSchema = z.object({
  action: z.literal("timeout"),
  eventId: z.string().uuid(),
});
const ColdCallSchema = z.discriminatedUnion("action", [DrawSchema, RevealSchema, ScoreSchema, EvaluateSchema, TimeoutSchema]);

export async function GET(request: NextRequest) {
  const user = await currentRequestUser(request);
  if (!user) return noStoreJson({ ok: false, error: "请先登录。" }, { status: 401 });
  return noStoreJson({ ok: true, event: await getLatestColdCallBroadcastForUser(user) });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireRequestRole(request, "teacher");
    if (!auth.ok) return noStoreJson({ ok: false, error: auth.error }, { status: auth.status });
    const parsed = ColdCallSchema.safeParse(await request.json());
    if (!parsed.success) return noStoreJson({ ok: false, error: "提问操作数据格式无效。" }, { status: 400 });
    if (parsed.data.action === "draw") {
      const data = await drawColdCall(parsed.data.classId, parsed.data.lessonId, parsed.data.kind);
      const broadcast = await publishColdCallBroadcast({
        actorUserId: auth.user.id,
        classId: parsed.data.classId,
        lessonId: parsed.data.lessonId,
        draw: data,
      });
      return noStoreJson({
        ok: true,
        data: { ...data, broadcast },
      });
    }
    if (parsed.data.action === "reveal") {
      return noStoreJson({ ok: true, answer: await revealColdCallAnswer(parsed.data.questionId) });
    }
    if (parsed.data.action === "evaluate" || parsed.data.action === "timeout") {
      const context = await getColdCallEvaluationContext(parsed.data.eventId);
      if (context.existing?.evaluation) {
        return noStoreJson({ ok: true, attempt: context.existing, reused: true });
      }
      const timedOut = parsed.data.action === "timeout";
      const responseText = parsed.data.action === "evaluate" ? parsed.data.studentAnswer : "";
      const evaluation = timedOut
        ? timedOutColdCallEvaluation({
          standardAnswer: context.question.answer,
          rubric: context.question.rubric,
          source: context.question.source,
        })
        : await evaluateColdCallAnswer({
          question: context.question.prompt,
          studentAnswer: responseText,
          standardAnswer: context.question.answer,
          rubric: context.question.rubric,
          source: context.question.source,
        }, { signal: request.signal });
      const attempt = await saveColdCallAttempt({
        actorUserId: auth.user.id,
        event: context.event,
        responseText,
        evaluation,
        timedOut,
      });
      return noStoreJson({ ok: true, attempt, reused: false });
    }
    return noStoreJson({
      ok: true,
      record: await recordColdCallScore({ actorUserId: auth.user.id, ...parsed.data }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
