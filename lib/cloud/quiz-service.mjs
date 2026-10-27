import "server-only";

import { completeMessages } from "./ai-service.mjs";
import { loadKnowledgeChunks } from "./knowledge.mjs";
import { runtimeDb } from "./runtime.mjs";
import { ensureSchema } from "../step8a/database";

const SESSION_MS = 30 * 60 * 1_000;

function textbooks() {
  return loadKnowledgeChunks().filter((chunk) => chunk.attributes?.source_type === "textbook");
}

function cleanLine(value) {
  return String(value || "").replace(/^#+\s*/u, "").replace(/^>.*$/gmu, "").replace(/\[[0-9]+\]/gu, "").replace(/\s+/gu, " ").trim();
}

function titleForUnit(chunks, unit) {
  for (const chunk of chunks) {
    const matched = String(chunk.content || "").match(new RegExp(`Unit\\s+${unit}\\s+([^\\n\\r]{3,160})`, "iu"));
    if (matched) return cleanLine(matched[1]);
  }
  const heading = cleanLine(String(chunks[0]?.content || "").split(/\r?\n/u).find((line) => /^#\s+/u.test(line)) || "");
  return heading || `Unit ${unit}`;
}

export function quizCatalog() {
  const grouped = new Map();
  for (const chunk of textbooks()) {
    const unit = Number(chunk.attributes?.unit || 0);
    if (!Number.isInteger(unit) || unit < 1) continue;
    if (!grouped.has(unit)) grouped.set(unit, []);
    grouped.get(unit).push(chunk);
  }
  const units = [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([unit, chunks]) => {
    const pages = chunks.map((chunk) => Number(chunk.attributes?.page || 0)).filter(Boolean);
    return {
      unit,
      part: String(chunks[0]?.attributes?.section || ""),
      title: titleForUnit(chunks, unit),
      start_page: Math.min(...pages),
      end_page: Math.max(...pages),
    };
  });
  return { package_version: "12.0.0", units, count_options: [3, 5, 10], focus_options: ["mixed", "vocabulary", "concept"] };
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const other = bytes[0] % (index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function evidenceForUnit(unit, limit = 18) {
  const chunks = shuffle(textbooks().filter((chunk) => Number(chunk.attributes?.unit) === unit)).slice(0, limit);
  return chunks.map((chunk, index) => ({
    id: `S${index + 1}`,
    citation: String(chunk.citation || "课程教材"),
    chunk_ids: [String(chunk.chunk_id || "")].filter(Boolean),
    source_type: "textbook",
    page: Number.isFinite(Number(chunk.attributes?.page)) ? Number(chunk.attributes.page) : null,
    unit: Number(chunk.attributes?.unit || unit),
    section: chunk.attributes?.section ? String(chunk.attributes.section) : null,
    excerpt: String(chunk.content || "").slice(0, 900),
    content: String(chunk.content || "").slice(0, 2_600),
    score: 1,
  }));
}

function firstUsefulSentence(content) {
  const body = String(content || "").split(/\r?\n/u)
    .map(cleanLine)
    .filter((line) => line.length >= 35 && !/^来源|^适用范围|^Unit\s+\d+/iu.test(line))
    .join(" ");
  return (body.match(/^.{30,190}?[.!?。！？](?:\s|$)/u)?.[0] || body.slice(0, 180)).trim();
}

function localQuestions(sources, count, focus) {
  const usable = sources.map((source) => ({ source, statement: firstUsefulSentence(source.content) })).filter((item) => item.statement.length >= 25);
  if (usable.length < 4) throw new Error("该Unit可用于出题的教材证据不足。");
  return Array.from({ length: count }, (_, index) => {
    const correct = usable[index % usable.length];
    const distractors = shuffle(usable.filter((item) => item.source.id !== correct.source.id)).slice(0, 3);
    const optionItems = shuffle([correct, ...distractors]);
    const answerIndex = optionItems.findIndex((item) => item.source.id === correct.source.id);
    return {
      id: `Q${index + 1}`,
      kind: focus === "vocabulary" ? "vocabulary" : index % 3 === 2 ? "translation" : "concept",
      stem: `根据Unit教材，以下哪一项最符合“${correct.source.citation.split("，").at(-1) || `知识点${index + 1}`}”对应原文？`,
      options: optionItems.map((item) => item.statement),
      answerIndex,
      explanation: `正确选项直接摘自教材证据；请结合该页上下文理解，不要只记字面。 [${correct.source.id}]`,
      sourceIds: [correct.source.id],
    };
  });
}

function stripFence(value) {
  return String(value || "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
}

function validateQuestions(value, count, sources) {
  if (!Array.isArray(value) || value.length !== count) return null;
  const validSources = new Set(sources.map((source) => source.id));
  const questions = [];
  for (const [index, item] of value.entries()) {
    const kind = ["vocabulary", "concept", "translation"].includes(item?.kind) ? item.kind : "concept";
    const options = Array.isArray(item?.options) ? item.options.map((option) => String(option || "").trim()).slice(0, 4) : [];
    const answerIndex = Number(item?.answer_index);
    const sourceIds = Array.isArray(item?.source_ids) ? item.source_ids.map(String).filter((id) => validSources.has(id)).slice(0, 3) : [];
    if (!String(item?.stem || "").trim() || options.length !== 4 || options.some((option) => !option) || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3 || !String(item?.explanation || "").trim() || !sourceIds.length) return null;
    questions.push({ id: `Q${index + 1}`, kind, stem: String(item.stem).trim().slice(0, 500), options: options.map((option) => option.slice(0, 300)), answerIndex, explanation: String(item.explanation).trim().slice(0, 1_500), sourceIds });
  }
  return questions;
}

async function generateQuestions(unit, count, focus, sources, signal) {
  const evidence = sources.map((source) => `[${source.id}] ${source.citation}\n${source.content}`).join("\n\n");
  const generated = await completeMessages([
    { role: "system", content: "你是《测绘专业英语》章节测试出题教师。只依据证据出四选一题；题干可中英结合。输出JSON数组，每项严格包含kind(vocabulary/concept/translation)、stem、options(4项)、answer_index(0-3)、explanation、source_ids。错误选项要有迷惑性但不能含糊，不得使用证据外知识，不得输出Markdown。" },
    { role: "user", content: `Unit ${unit}；题量${count}；重点${focus}。\n教材证据：\n${evidence}` },
  ], { signal, maxTokens: 2600, temperature: 0.35 });
  if (generated) {
    try {
      const parsed = JSON.parse(stripFence(generated));
      const valid = validateQuestions(parsed, count, sources);
      if (valid) return valid;
    } catch { /* Use deterministic evidence-only fallback. */ }
  }
  return localQuestions(sources, count, focus);
}

function publicQuiz(session) {
  return {
    quiz_id: session.id,
    unit: session.unit,
    unit_title: session.unitTitle,
    focus: session.focus,
    count: session.questions.length,
    expires_at: new Date(session.expiresAt).toISOString(),
    questions: session.questions.map(({ id, kind, stem, options }) => ({ id, kind, stem, options })),
  };
}

export async function createCloudQuiz(userId, input, signal) {
  const catalog = quizCatalog();
  const unit = catalog.units.find((item) => item.unit === input.unit);
  if (!unit) throw new Error("请选择有效的教材Unit。");
  const sources = evidenceForUnit(input.unit);
  if (!sources.length) throw new Error("该Unit暂时没有可用于章节测试的教材内容。");
  const now = Date.now();
  const session = {
    id: crypto.randomUUID(),
    unit: input.unit,
    unitTitle: unit.title,
    focus: input.focus,
    questions: await generateQuestions(input.unit, input.count, input.focus, sources, signal),
    sources,
    expiresAt: now + SESSION_MS,
  };
  await ensureSchema();
  await runtimeDb().batch([
    runtimeDb().prepare("DELETE FROM quiz_sessions WHERE expires_at<=?").bind(now),
    runtimeDb().prepare("INSERT INTO quiz_sessions (id,user_id,payload_json,expires_at,created_at) VALUES (?,?,?,?,?)").bind(session.id, userId, JSON.stringify(session), session.expiresAt, new Date(now).toISOString()),
  ]);
  return publicQuiz(session);
}

async function loadSession(userId, quizId) {
  await ensureSchema();
  const row = await runtimeDb().prepare("SELECT payload_json FROM quiz_sessions WHERE id=? AND user_id=? AND expires_at>?").bind(quizId, userId, Date.now()).first();
  if (!row?.payload_json) throw new Error("本次测试已过期，请重新生成试题。");
  return JSON.parse(String(row.payload_json));
}

function answerResults(session, answers, revealed) {
  const byId = new Map((answers || []).map((answer) => [answer.question_id, answer.selected_index]));
  let correct = 0;
  const bySource = new Map(session.sources.map((source) => [source.id, source]));
  const results = session.questions.map((question) => {
    const selected = byId.has(question.id) ? byId.get(question.id) : null;
    const isCorrect = selected === null ? null : selected === question.answerIndex;
    if (isCorrect) correct += 1;
    return {
      question_id: question.id,
      selected_index: selected,
      correct_index: question.answerIndex,
      is_correct: isCorrect,
      correct_answer: question.options[question.answerIndex],
      explanation: question.explanation,
      sources: question.sourceIds.map((id) => bySource.get(id)).filter(Boolean).map((source) => {
        const result = { ...source };
        delete result.content;
        delete result.score;
        return result;
      }),
    };
  });
  return { quiz_id: session.id, unit: session.unit, unit_title: session.unitTitle, revealed, answered: results.filter((item) => item.selected_index !== null).length, correct, total: results.length, score: revealed ? null : Math.round((correct / results.length) * 100), results };
}

export async function gradeCloudQuiz(userId, input) {
  const session = await loadSession(userId, input.quiz_id);
  const ids = new Set(session.questions.map((question) => question.id));
  if (input.answers.some((answer) => !ids.has(answer.question_id))) throw new Error("提交的章节测试答案格式不正确。");
  return answerResults(session, input.answers, false);
}

export async function revealCloudQuiz(userId, input) {
  return answerResults(await loadSession(userId, input.quiz_id), [], true);
}
