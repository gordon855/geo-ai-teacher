import "server-only";

import crypto from "node:crypto";
import { createBailianClient } from "../step4/bailian.mjs";
import { loadChatConfig, resolveBailianSettings, resolveProjectRoot } from "../step4/config.mjs";
import { Step4Error } from "../step4/errors.mjs";
import { sourceDto } from "../step4/grounding.mjs";
import { loadCourseIndex } from "../step4/index-store.mjs";
import { isGlossaryChunk } from "./query-planner.mjs";
import { buildQuizMessages, parseGeneratedQuiz } from "./quiz-grounding.mjs";
import { getQuizSession, saveQuizSession } from "./quiz-store.mjs";
import { loadTextbookCorpus } from "./textbook-corpus.mjs";

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = crypto.randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function selectCandidateChunks(chunks, unit, focus) {
  const eligible = chunks.filter((chunk) =>
    chunk.attributes?.source_type === "textbook" && Number(chunk.attributes?.unit) === unit,
  );
  const glossary = shuffled(eligible.filter(isGlossaryChunk));
  const body = shuffled(eligible.filter((chunk) => !isGlossaryChunk(chunk)));
  if (focus === "vocabulary") return [...glossary, ...body];
  if (focus === "concept") return [...body, ...glossary];
  const mixed = [];
  while (glossary.length > 0 || body.length > 0) {
    if (body.length > 0) mixed.push(body.shift());
    if (glossary.length > 0) mixed.push(glossary.shift());
  }
  return mixed;
}

function buildQuizSources(courseIndex, unit, focus, config) {
  const candidates = selectCandidateChunks(courseIndex.chunks, unit, focus);
  const sources = [];
  const seenCitations = new Set();
  let totalCharacters = 0;
  for (const chunk of candidates) {
    if (sources.length >= Number(config.quiz.candidate_sources)) break;
    if (seenCitations.has(chunk.citation)) continue;
    const remaining = Number(config.quiz.max_context_characters) - totalCharacters;
    if (remaining <= 0) break;
    const content = String(chunk.content || "").slice(
      0,
      Math.min(Number(config.retrieval.max_characters_per_source), remaining),
    );
    if (!content) continue;
    const source = {
      id: `S${sources.length + 1}`,
      citation: chunk.citation,
      chunkIds: [chunk.chunk_id],
      sourceType: "textbook",
      page: Number.isInteger(chunk.attributes?.page) ? chunk.attributes.page : null,
      unit,
      section: chunk.attributes?.section || null,
      content,
    };
    sources.push(source);
    seenCitations.add(chunk.citation);
    totalCharacters += content.length;
  }
  if (sources.length === 0) {
    throw new Step4Error("QUIZ_EVIDENCE_EMPTY", "指定Unit没有可用教材证据。", {
      httpStatus: 404,
      publicMessage: "该Unit暂时没有可用于章节测试的教材内容。",
    });
  }
  return sources;
}

function publicQuestion(question) {
  return {
    id: question.id,
    kind: question.kind,
    stem: question.stem,
    options: question.options,
  };
}

function publicQuiz(session) {
  return {
    quiz_id: session.id,
    unit: session.unit.unit,
    unit_title: session.unit.unit_title,
    focus: session.focus,
    count: session.questions.length,
    expires_at: new Date(session.expiresAt).toISOString(),
    questions: session.questions.map(publicQuestion),
  };
}

export async function getQuizCatalog(options = {}) {
  const projectRoot = options.projectRoot || resolveProjectRoot();
  const config = options.config || loadChatConfig(projectRoot);
  const corpus = options.corpus || await loadTextbookCorpus(projectRoot, config);
  return {
    package_version: config.package_version,
    units: corpus.units.map((unit) => ({
      unit: unit.unit,
      part: unit.part,
      title: unit.unit_title,
      start_page: unit.start_page,
      end_page: unit.end_page,
    })),
    count_options: [3, 5, 10].filter((count) => count <= config.quiz.maximum_count),
    focus_options: [...config.quiz.focuses],
  };
}

export async function createQuiz(input, options = {}) {
  const projectRoot = options.projectRoot || resolveProjectRoot();
  const config = options.config || loadChatConfig(projectRoot);
  const [courseIndex, corpus] = await Promise.all([
    options.courseIndex || loadCourseIndex(projectRoot),
    options.corpus || loadTextbookCorpus(projectRoot, config),
  ]);
  const unit = corpus.unitByNumber.get(input.unit);
  if (!unit) {
    throw new Step4Error("QUIZ_UNIT_INVALID", "章节测试Unit不存在。", {
      httpStatus: 400,
      publicMessage: "请选择有效的教材Unit。",
    });
  }
  const sources = buildQuizSources(courseIndex, input.unit, input.focus, config);
  const settings = options.settings || resolveBailianSettings(config);
  const client = options.client || createBailianClient(settings, config);
  let questions;
  let lastError;
  for (let attempt = 0; attempt < Number(config.quiz.generation_max_attempts); attempt += 1) {
    const messages = buildQuizMessages({
      unit,
      count: input.count,
      focus: input.focus,
      sources,
      nonce: crypto.randomBytes(12).toString("hex"),
    });
    const raw = await client.generateJson(messages, options.signal, {
      temperature: Number(config.quiz.generation_temperature),
      maxTokens: Number(config.quiz.generation_max_tokens),
    });
    try {
      questions = parseGeneratedQuiz(raw, { count: input.count, sources });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!questions) throw lastError;
  const session = saveQuizSession({
    unit,
    focus: input.focus,
    questions,
    sources: Object.freeze(sources),
  }, config);
  return publicQuiz(session);
}

function resultSourceDtos(question, session) {
  const used = new Set(question.sourceIds);
  return session.sources.filter((source) => used.has(source.id)).map(sourceDto);
}

function answerResults(session, answers, revealed) {
  const byQuestion = new Map((answers || []).map((answer) => [answer.question_id, answer.selected_index]));
  let correct = 0;
  const results = session.questions.map((question) => {
    const selected = byQuestion.has(question.id) ? byQuestion.get(question.id) : null;
    const isCorrect = selected === null ? null : selected === question.answerIndex;
    if (isCorrect) correct += 1;
    return {
      question_id: question.id,
      selected_index: selected,
      correct_index: question.answerIndex,
      is_correct: isCorrect,
      correct_answer: question.options[question.answerIndex],
      explanation: question.explanation,
      sources: resultSourceDtos(question, session),
    };
  });
  const answered = results.filter((result) => result.selected_index !== null).length;
  return {
    quiz_id: session.id,
    unit: session.unit.unit,
    unit_title: session.unit.unit_title,
    revealed,
    answered,
    correct,
    total: session.questions.length,
    score: revealed ? null : Math.round((correct / session.questions.length) * 100),
    results,
  };
}

export function gradeQuiz(input) {
  const session = getQuizSession(input.quiz_id);
  const validIds = new Set(session.questions.map((question) => question.id));
  if (input.answers.some((answer) => !validIds.has(answer.question_id))) {
    throw new Step4Error("QUIZ_ANSWERS_INVALID", "章节测试答案包含未知题号。", {
      httpStatus: 400,
      publicMessage: "提交的章节测试答案格式不正确。",
    });
  }
  return answerResults(session, input.answers, false);
}

export function revealQuiz(input) {
  const session = getQuizSession(input.quiz_id);
  return answerResults(session, [], true);
}
