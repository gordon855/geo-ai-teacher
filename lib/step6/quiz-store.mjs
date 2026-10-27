import "server-only";

import crypto from "node:crypto";
import { Step4Error } from "../step4/errors.mjs";

const QUIZ_STORE_SYMBOL = Symbol.for("surveying-ai-teacher.step6.quiz-store");

function store() {
  if (!globalThis[QUIZ_STORE_SYMBOL]) globalThis[QUIZ_STORE_SYMBOL] = new Map();
  return globalThis[QUIZ_STORE_SYMBOL];
}

function prune(now, maximum) {
  const sessions = store();
  for (const [id, value] of sessions) {
    if (value.expiresAt <= now) sessions.delete(id);
  }
  while (sessions.size >= maximum) {
    const oldest = sessions.keys().next().value;
    if (!oldest) break;
    sessions.delete(oldest);
  }
}

export function saveQuizSession(quiz, config) {
  const now = Date.now();
  prune(now, Number(config.quiz.max_active_sessions));
  const id = crypto.randomUUID();
  const value = Object.freeze({
    ...quiz,
    id,
    createdAt: now,
    expiresAt: now + Number(config.quiz.session_ttl_ms),
  });
  store().set(id, value);
  return value;
}

export function getQuizSession(id) {
  const sessions = store();
  const value = sessions.get(id);
  if (!value || value.expiresAt <= Date.now()) {
    if (value) sessions.delete(id);
    throw new Step4Error("QUIZ_EXPIRED", "章节测试不存在或已过期。", {
      httpStatus: 410,
      publicMessage: "这组章节测试已过期，请重新随机出题。",
    });
  }
  return value;
}

export function clearQuizStoreForTests() {
  store().clear();
}
