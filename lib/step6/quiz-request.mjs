import { z } from "zod";
import { Step4Error } from "../step4/errors.mjs";

export async function parseQuizRequest(request, config) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new Step4Error("CONTENT_TYPE_UNSUPPORTED", "章节测试请求不是JSON。", {
      httpStatus: 415,
      publicMessage: "请使用JSON格式提交章节测试请求。",
    });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > config.request.max_body_bytes) {
    throw new Step4Error("REQUEST_TOO_LARGE", "章节测试请求超过限制。", {
      httpStatus: 413,
      publicMessage: "章节测试请求内容过长。",
    });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > config.request.max_body_bytes) {
    throw new Step4Error("REQUEST_TOO_LARGE", "章节测试请求超过限制。", {
      httpStatus: 413,
      publicMessage: "章节测试请求内容过长。",
    });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    throw new Step4Error("JSON_INVALID", "章节测试JSON无法解析。", {
      cause: error,
      httpStatus: 400,
      publicMessage: "章节测试请求格式不正确。",
    });
  }

  const focusValues = config.quiz.focuses;
  const focusSchema = z.string().refine((value) => focusValues.includes(value));
  const answerSchema = z.object({
    question_id: z.string().regex(/^Q\d+$/u),
    selected_index: z.number().int().min(0).max(3),
  }).strict();
  const schema = z.discriminatedUnion("action", [
    z.object({
      action: z.literal("generate"),
      unit: z.number().int().min(1).max(99),
      count: z.number().int()
        .min(Number(config.quiz.minimum_count))
        .max(Number(config.quiz.maximum_count))
        .default(Number(config.quiz.default_count)),
      focus: focusSchema.default("mixed"),
    }).strict(),
    z.object({
      action: z.literal("grade"),
      quiz_id: z.string().uuid(),
      answers: z.array(answerSchema).max(Number(config.quiz.maximum_count)),
    }).strict(),
    z.object({
      action: z.literal("reveal"),
      quiz_id: z.string().uuid(),
    }).strict(),
  ]);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Step4Error("QUIZ_REQUEST_INVALID", "章节测试字段校验失败。", {
      httpStatus: 400,
      publicMessage: "Unit、题量、题型或答案格式不正确。",
    });
  }
  if (parsed.data.action === "grade") {
    const ids = parsed.data.answers.map((answer) => answer.question_id);
    if (new Set(ids).size !== ids.length) {
      throw new Step4Error("QUIZ_REQUEST_INVALID", "章节测试答案题号重复。", {
        httpStatus: 400,
        publicMessage: "提交的章节测试答案包含重复题号。",
      });
    }
  }
  return parsed.data;
}
