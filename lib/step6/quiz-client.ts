import type { CourseSource } from "@/lib/step5/chat-client";

export type QuizFocus = "mixed" | "vocabulary" | "concept";
export type QuizQuestionKind = "vocabulary" | "concept" | "translation";

export interface QuizUnit {
  unit: number;
  part: string;
  title: string;
  start_page: number;
  end_page: number;
}

export interface QuizCatalog {
  units: QuizUnit[];
  countOptions: number[];
  focusOptions: QuizFocus[];
}

export interface QuizQuestion {
  id: string;
  kind: QuizQuestionKind;
  stem: string;
  options: string[];
}

export interface QuizSession {
  quizId: string;
  unit: number;
  unitTitle: string;
  focus: QuizFocus;
  count: number;
  expiresAt: string;
  questions: QuizQuestion[];
}

export interface QuizAnswerResult {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean | null;
  correctAnswer: string;
  explanation: string;
  sources: CourseSource[];
}

export interface QuizResult {
  quizId: string;
  revealed: boolean;
  answered: number;
  correct: number;
  total: number;
  score: number | null;
  results: QuizAnswerResult[];
}

export class QuizUiError extends Error {
  code: string;
  publicMessage: string;
  requestId?: string;

  constructor(code: string, publicMessage: string, requestId?: string) {
    super(publicMessage);
    this.name = "QuizUiError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maximum = 8_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSource(value: unknown): CourseSource | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 20);
  const citation = cleanString(value.citation, 500);
  if (!/^S\d+$/u.test(id) || !citation) return null;
  return {
    id,
    citation,
    chunk_ids: Array.isArray(value.chunk_ids)
      ? value.chunk_ids.map((item) => cleanString(item, 120)).filter(Boolean).slice(0, 20)
      : [],
    source_type: cleanString(value.source_type, 80),
    page: numberOrNull(value.page),
    unit: typeof value.unit === "number" || typeof value.unit === "string" ? value.unit : null,
    section: cleanString(value.section, 160) || null,
    excerpt: cleanString(value.excerpt, 1_000),
  };
}

export function normalizeQuizCatalog(payload: unknown): QuizCatalog {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.units)) {
    throw new QuizUiError("QUIZ_CATALOG_INVALID", "章节列表加载失败。", cleanString(payload && isRecord(payload) ? payload.request_id : "", 120));
  }
  const units = payload.units.map((value) => {
    if (!isRecord(value)) return null;
    const unit = numberOrNull(value.unit);
    const title = cleanString(value.title, 240);
    const startPage = numberOrNull(value.start_page);
    const endPage = numberOrNull(value.end_page);
    if (!Number.isInteger(unit) || !title || !Number.isInteger(startPage) || !Number.isInteger(endPage)) return null;
    return {
      unit: unit as number,
      part: cleanString(value.part, 80),
      title,
      start_page: startPage as number,
      end_page: endPage as number,
    };
  }).filter((unit): unit is QuizUnit => unit !== null);
  const countOptions = Array.isArray(payload.count_options)
    ? payload.count_options.filter((value): value is number => Number.isInteger(value) && Number(value) > 0)
    : [];
  const focusOptions = Array.isArray(payload.focus_options)
    ? payload.focus_options.filter((value): value is QuizFocus =>
      value === "mixed" || value === "vocabulary" || value === "concept")
    : [];
  if (units.length === 0 || countOptions.length === 0 || focusOptions.length === 0) {
    throw new QuizUiError("QUIZ_CATALOG_INVALID", "章节列表内容不完整。", cleanString(payload.request_id, 120));
  }
  return { units, countOptions, focusOptions };
}

export function normalizeGeneratedQuiz(payload: unknown): QuizSession {
  if (!isRecord(payload) || payload.ok !== true || payload.status !== "quiz_ready" || !Array.isArray(payload.questions)) {
    throw new QuizUiError("QUIZ_RESPONSE_INVALID", "随机试题返回格式不正确。", cleanString(payload && isRecord(payload) ? payload.request_id : "", 120));
  }
  const questions = payload.questions.map((value) => {
    if (!isRecord(value)) return null;
    if (
      "answer_index" in value ||
      "correct_index" in value ||
      "correct_answer" in value ||
      "explanation" in value
    ) {
      throw new QuizUiError("QUIZ_ANSWER_LEAK", "试题在提交前包含答案，已停止显示。", cleanString(payload.request_id, 120));
    }
    const id = cleanString(value.id, 20);
    const kind = value.kind;
    const stem = cleanString(value.stem, 500);
    const options = Array.isArray(value.options)
      ? value.options.map((option) => cleanString(option, 300))
      : [];
    if (
      !/^Q\d+$/u.test(id) ||
      (kind !== "vocabulary" && kind !== "concept" && kind !== "translation") ||
      !stem ||
      options.length !== 4 ||
      options.some((option) => !option)
    ) return null;
    return { id, kind, stem, options };
  }).filter((question): question is QuizQuestion => question !== null);
  const count = numberOrNull(payload.count);
  const unit = numberOrNull(payload.unit);
  const focus = payload.focus;
  if (
    !Number.isInteger(count) ||
    questions.length !== count ||
    !Number.isInteger(unit) ||
    (focus !== "mixed" && focus !== "vocabulary" && focus !== "concept")
  ) {
    throw new QuizUiError("QUIZ_RESPONSE_INVALID", "随机试题内容不完整。", cleanString(payload.request_id, 120));
  }
  return {
    quizId: cleanString(payload.quiz_id, 80),
    unit: unit as number,
    unitTitle: cleanString(payload.unit_title, 240),
    focus,
    count: count as number,
    expiresAt: cleanString(payload.expires_at, 80),
    questions,
  };
}

export function normalizeQuizResult(payload: unknown): QuizResult {
  if (
    !isRecord(payload) ||
    payload.ok !== true ||
    (payload.status !== "graded" && payload.status !== "revealed") ||
    !Array.isArray(payload.results)
  ) {
    throw new QuizUiError("QUIZ_RESULT_INVALID", "判分结果返回格式不正确。", cleanString(payload && isRecord(payload) ? payload.request_id : "", 120));
  }
  const results = payload.results.map((value) => {
    if (!isRecord(value)) return null;
    const questionId = cleanString(value.question_id, 20);
    const selectedIndex = value.selected_index === null ? null : numberOrNull(value.selected_index);
    const correctIndex = numberOrNull(value.correct_index);
    const isCorrect = value.is_correct === null ? null : value.is_correct;
    const explanation = cleanString(value.explanation, 1_600);
    const correctAnswer = cleanString(value.correct_answer, 300);
    const sources = Array.isArray(value.sources)
      ? value.sources.map(normalizeSource).filter((source): source is CourseSource => source !== null)
      : [];
    if (
      !/^Q\d+$/u.test(questionId) ||
      (selectedIndex !== null && (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3)) ||
      !Number.isInteger(correctIndex) ||
      (isCorrect !== null && typeof isCorrect !== "boolean") ||
      !explanation ||
      !correctAnswer ||
      sources.length === 0
    ) return null;
    return {
      questionId,
      selectedIndex: selectedIndex as number | null,
      correctIndex: correctIndex as number,
      isCorrect: isCorrect as boolean | null,
      correctAnswer,
      explanation,
      sources,
    };
  }).filter((result): result is QuizAnswerResult => result !== null);
  const total = numberOrNull(payload.total);
  if (!Number.isInteger(total) || results.length !== total) {
    throw new QuizUiError("QUIZ_RESULT_INVALID", "判分结果内容不完整。", cleanString(payload.request_id, 120));
  }
  return {
    quizId: cleanString(payload.quiz_id, 80),
    revealed: payload.revealed === true,
    answered: Number(payload.answered || 0),
    correct: Number(payload.correct || 0),
    total: total as number,
    score: payload.score === null ? null : Number(payload.score),
    results,
  };
}

export function quizErrorFromPayload(payload: unknown, status: number) {
  if (isRecord(payload) && payload.ok === false && isRecord(payload.error)) {
    return new QuizUiError(
      cleanString(payload.error.code, 100) || `HTTP_${status}`,
      cleanString(payload.error.message, 500) || "章节测试服务暂时不可用。",
      cleanString(payload.request_id, 120) || undefined,
    );
  }
  return new QuizUiError(`HTTP_${status}`, "章节测试服务暂时不可用，请稍后重试。");
}
