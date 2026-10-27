import { z } from "zod";
import { Step4Error } from "./errors.mjs";
import { CHAT_MODES } from "./retrieval.mjs";

export async function parseChatRequest(request, config) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new Step4Error("CONTENT_TYPE_UNSUPPORTED", "请求不是JSON。", {
      httpStatus: 415,
      publicMessage: "请使用JSON格式提交问题。",
    });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > config.request.max_body_bytes) {
    throw new Step4Error("REQUEST_TOO_LARGE", "请求体超过限制。", {
      httpStatus: 413,
      publicMessage: "问题内容过长，请缩短后重试。",
    });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > config.request.max_body_bytes) {
    throw new Step4Error("REQUEST_TOO_LARGE", "请求体超过限制。", {
      httpStatus: 413,
      publicMessage: "问题内容过长，请缩短后重试。",
    });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    throw new Step4Error("JSON_INVALID", "请求JSON无法解析。", {
      cause: error,
      httpStatus: 400,
      publicMessage: "问题格式不正确。",
    });
  }

  const historyMessage = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(config.request.max_history_characters_per_message),
  }).strict();
  const schema = z.object({
    question: z.string().trim()
      .min(config.request.min_question_characters)
      .max(config.request.max_question_characters),
    mode: z.string().default("auto").refine((value) => CHAT_MODES.has(value)),
    history: z.array(historyMessage).max(config.request.max_history_messages).default([]),
  }).strict();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Step4Error("REQUEST_VALIDATION_FAILED", "问题字段校验失败。", {
      httpStatus: 400,
      publicMessage: "问题、学习模式或对话历史格式不正确。",
    });
  }
  const historyCharacters = parsed.data.history.reduce((sum, item) => sum + item.content.length, 0);
  if (historyCharacters > config.request.max_history_total_characters) {
    throw new Step4Error("HISTORY_TOO_LARGE", "对话历史超过限制。", {
      httpStatus: 413,
      publicMessage: "对话历史过长，请开始一个新话题。",
    });
  }
  return parsed.data;
}
