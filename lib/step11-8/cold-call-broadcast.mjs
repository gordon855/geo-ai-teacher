export const COLD_CALL_BROADCAST_TTL_MS = 15 * 60 * 1_000;
export const COLD_CALL_ANSWER_WINDOW_SECONDS = 60;

function clean(value, maximum = 2_000) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

export function buildColdCallBroadcast(input) {
  const now = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const studentName = clean(input.student?.name, 120);
  const prompt = clean(input.question?.prompt, 2_000);
  if (!input.id || !input.classId || !input.lessonId || !studentName || !prompt) {
    throw new Error("点名提问同步数据不完整。");
  }
  const studentAddress = /同学$/u.test(studentName) ? studentName : `${studentName}同学`;
  return {
    id: clean(input.id, 120),
    classId: clean(input.classId, 100),
    lessonId: clean(input.lessonId, 150),
    student: {
      id: clean(input.student.id, 120),
      name: studentName,
      studentNo: clean(input.student.studentNo, 120),
    },
    question: {
      id: clean(input.question.id, 120),
      kind: clean(input.question.kind, 30),
      prompt,
      source: clean(input.question.source, 500),
    },
    spokenText: `课堂点名提问。请${studentAddress}回答：${prompt}`,
    answerWindowSeconds: COLD_CALL_ANSWER_WINDOW_SECONDS,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + COLD_CALL_BROADCAST_TTL_MS).toISOString(),
  };
}

export function parseColdCallBroadcast(value) {
  if (!value || typeof value !== "object") return null;
  const event = value;
  if (
    typeof event.id !== "string"
    || typeof event.classId !== "string"
    || typeof event.lessonId !== "string"
    || typeof event.spokenText !== "string"
    || !event.student
    || typeof event.student.name !== "string"
    || !event.question
    || typeof event.question.prompt !== "string"
  ) return null;
  return event;
}
