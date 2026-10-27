export const CHAT_MODE_OPTIONS = [
  {
    id: "auto",
    label: "智能问答",
    shortLabel: "问答",
    hint: "课程规定、教学进度或综合问题",
    example: "本课程的成绩如何考核？",
  },
  {
    id: "terminology",
    label: "专业词汇",
    shortLabel: "词汇",
    hint: "术语译法、含义和测绘语境",
    example: "accuracy和precision在测量学中有什么区别？",
  },
  {
    id: "original",
    label: "教材原文",
    shortLabel: "原文",
    hint: "查找教材正文原句，并给出翻译和解释",
    example: "请给出教材中关于支导线的英文原文、中文翻译和解释。",
  },
  {
    id: "translation",
    label: "中英翻译",
    shortLabel: "翻译",
    hint: "教材句段和专业表达翻译",
    example: "请翻译并解释：Geodesy is the science of measuring the Earth.",
  },
  {
    id: "explanation",
    label: "原理讲解",
    shortLabel: "原理",
    hint: "用本科生易懂的方式解释原理",
    example: "请解释GNSS相对定位的基本原理。",
  },
  {
    id: "quiz",
    label: "章节测试",
    shortLabel: "测试",
    hint: "依据课程资料生成练习和要点",
    example: "请根据Unit 1出3道专业词汇测试题。",
  },
] as const;

export type ChatMode = (typeof CHAT_MODE_OPTIONS)[number]["id"];
export type ChatRole = "user" | "assistant";
export type MessageState =
  | "welcome"
  | "sent"
  | "answered"
  | "insufficient"
  | "error";
export type Confidence = "high" | "medium" | "guarded" | "low";

export interface CourseSource {
  id: string;
  citation: string;
  chunk_ids: string[];
  source_type: string;
  page: number | null;
  unit: number | string | null;
  section: string | null;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  state: MessageState;
  includeInHistory: boolean;
  mode?: ChatMode;
  confidence?: Confidence;
  sources?: CourseSource[];
  requestId?: string;
  retryQuestion?: string;
  verbatimVerified?: boolean;
  retrievalStrategy?: string;
}

export interface HistoryMessage {
  role: ChatRole;
  content: string;
}

export interface ChatApiResult {
  requestId: string;
  status: "answered" | "insufficient_evidence";
  answer: string;
  mode: ChatMode;
  authorityMode: string;
  confidence: Confidence;
  sources: CourseSource[];
  verbatimVerified: boolean;
  retrievalStrategy: string;
}

export class ChatUiError extends Error {
  code: string;
  publicMessage: string;
  requestId?: string;

  constructor(code: string, publicMessage: string, requestId?: string) {
    super(publicMessage);
    this.name = "ChatUiError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.requestId = requestId;
  }
}

const MODE_IDS = new Set<string>(CHAT_MODE_OPTIONS.map((item) => item.id));
const CONFIDENCE_VALUES = new Set<string>(["high", "medium", "guarded", "low"]);
const MESSAGE_STATES = new Set<string>([
  "sent",
  "answered",
  "insufficient",
  "error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maximum = 8_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && MODE_IDS.has(value);
}

export function modeLabel(mode: ChatMode) {
  return CHAT_MODE_OPTIONS.find((item) => item.id === mode)?.label || "智能问答";
}

export function buildHistoryPayload(messages: ChatMessage[]): HistoryMessage[] {
  const candidates = messages
    .filter((message) => message.includeInHistory)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 1_200),
    }))
    .filter((message) => message.content.length > 0);

  const selected: HistoryMessage[] = [];
  let totalCharacters = 0;
  for (let index = candidates.length - 1; index >= 0 && selected.length < 6; index -= 1) {
    const available = 4_000 - totalCharacters;
    if (available <= 0) break;
    const candidate = candidates[index];
    const content = candidate.content.slice(0, available);
    if (!content) continue;
    selected.unshift({ role: candidate.role, content });
    totalCharacters += content.length;
  }
  return selected;
}

function normalizeSource(value: unknown): CourseSource | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 20);
  const citation = cleanString(value.citation, 500);
  if (!/^S\d+$/u.test(id) || !citation) return null;
  const chunkIds = Array.isArray(value.chunk_ids)
    ? value.chunk_ids.map((item) => cleanString(item, 120)).filter(Boolean).slice(0, 20)
    : [];
  const page = typeof value.page === "number" && Number.isFinite(value.page)
    ? value.page
    : null;
  const unit = typeof value.unit === "number" || typeof value.unit === "string"
    ? value.unit
    : null;
  return {
    id,
    citation,
    chunk_ids: chunkIds,
    source_type: cleanString(value.source_type, 80),
    page,
    unit,
    section: cleanString(value.section, 160) || null,
    excerpt: cleanString(value.excerpt, 1_000),
  };
}

export function normalizeChatPayload(payload: unknown): ChatApiResult {
  if (!isRecord(payload) || payload.ok !== true) {
    throw new ChatUiError("RESPONSE_INVALID", "服务器返回了无法识别的回答格式。");
  }
  const status = payload.status;
  const answer = cleanString(payload.answer);
  const requestId = cleanString(payload.request_id, 120);
  const sources = Array.isArray(payload.sources)
    ? payload.sources.map(normalizeSource).filter((source): source is CourseSource => source !== null)
    : [];
  if (
    (status !== "answered" && status !== "insufficient_evidence") ||
    !answer ||
    !isChatMode(payload.mode) ||
    typeof payload.authority_mode !== "string" ||
    !CONFIDENCE_VALUES.has(String(payload.confidence))
  ) {
    throw new ChatUiError("RESPONSE_INVALID", "服务器返回了无法识别的回答格式。", requestId);
  }
  if (status === "answered") {
    const allowed = new Set(sources.map((source) => source.id));
    const markers = [...answer.matchAll(/\[S\d+\]/gu)].map((match) => match[0].slice(1, -1));
    if (sources.length === 0 || markers.length === 0 || markers.some((id) => !allowed.has(id))) {
      throw new ChatUiError(
        "CITATION_INVALID",
        "回答的资料引用未通过网页校验，请重新提问。",
        requestId,
      );
    }
  }
  return {
    requestId,
    status,
    answer,
    mode: payload.mode,
    authorityMode: payload.authority_mode,
    confidence: payload.confidence as Confidence,
    sources: status === "answered" ? sources : [],
    verbatimVerified: payload.verbatim_verified === true,
    retrievalStrategy: cleanString(payload.retrieval_strategy, 80),
  };
}

export function apiErrorFromPayload(payload: unknown, status: number) {
  if (isRecord(payload) && payload.ok === false && isRecord(payload.error)) {
    const code = cleanString(payload.error.code, 100) || `HTTP_${status}`;
    const message = cleanString(payload.error.message, 500) || "课程问答服务暂时不可用。";
    return new ChatUiError(code, message, cleanString(payload.request_id, 120) || undefined);
  }
  if (status === 429) {
    return new ChatUiError("RATE_LIMITED", "提问较频繁，请稍等片刻后再试。");
  }
  return new ChatUiError(`HTTP_${status}`, "课程问答服务暂时不可用，请稍后重试。");
}

interface StoredSession {
  version: 1;
  mode: ChatMode;
  messages: ChatMessage[];
}

export function serializeSession(messages: ChatMessage[], mode: ChatMode) {
  const persisted = messages
    .filter((message) => message.state !== "welcome")
    .slice(-30)
    .map((message) => ({
      ...message,
      content: message.content.slice(0, 8_000),
      sources: message.sources?.slice(0, 6).map((source) => ({
        ...source,
        excerpt: source.excerpt.slice(0, 1_000),
      })),
    }));
  return JSON.stringify({ version: 1, mode, messages: persisted } satisfies StoredSession);
}

export function restoreSession(serialized: string | null): StoredSession | null {
  if (!serialized || serialized.length > 1_000_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isChatMode(parsed.mode)) return null;
  if (!Array.isArray(parsed.messages)) return null;

  const messages: ChatMessage[] = [];
  for (const [index, value] of parsed.messages.slice(-30).entries()) {
    if (!isRecord(value)) continue;
    const role = value.role;
    const state = value.state;
    const content = cleanString(value.content);
    if (
      (role !== "user" && role !== "assistant") ||
      typeof state !== "string" ||
      !MESSAGE_STATES.has(state) ||
      !content
    ) continue;
    const sources = Array.isArray(value.sources)
      ? value.sources.map(normalizeSource).filter((source): source is CourseSource => source !== null)
      : undefined;
    messages.push({
      id: `restored-${index}-${Math.abs(Number(value.createdAt) || index)}`,
      role,
      content,
      createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now(),
      state: state as MessageState,
      includeInHistory: state !== "error",
      mode: isChatMode(value.mode) ? value.mode : undefined,
      confidence: CONFIDENCE_VALUES.has(String(value.confidence))
        ? value.confidence as Confidence
        : undefined,
      sources,
      requestId: cleanString(value.requestId, 120) || undefined,
      retryQuestion: cleanString(value.retryQuestion, 4_000) || undefined,
      verbatimVerified: value.verbatimVerified === true,
      retrievalStrategy: cleanString(value.retrievalStrategy, 80) || undefined,
    });
  }
  return { version: 1, mode: parsed.mode, messages };
}
