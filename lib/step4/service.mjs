import "server-only";

import { createBailianClient } from "./bailian.mjs";
import { loadChatConfig, resolveBailianSettings, resolveProjectRoot } from "./config.mjs";
import { Step4Error } from "./errors.mjs";
import {
  buildGroundedMessages,
  parseGroundedAnswer,
  sourceDto,
} from "./grounding.mjs";
import { loadCourseIndex } from "./index-store.mjs";
import {
  buildEvidenceSources,
  evaluateEvidence,
  hybridSearch,
} from "./retrieval.mjs";
import {
  buildOriginalMessages,
  parseOriginalAnswer,
  selectOriginalPassage,
} from "../step6/original-answer.mjs";
import { planSmartQuery } from "../step6/query-planner.mjs";
import { loadTextbookCorpus } from "../step6/textbook-corpus.mjs";

export async function answerCourseQuestion(input, options = {}) {
  const projectRoot = options.projectRoot || resolveProjectRoot();
  const config = options.config || loadChatConfig(projectRoot);
  const courseIndex = options.courseIndex || await loadCourseIndex(projectRoot);
  const settings = options.settings || resolveBailianSettings(config);
  if (
    courseIndex.meta.embedding_model !== settings.embeddingModel ||
    courseIndex.meta.dimensions !== settings.dimensions
  ) {
    throw new Step4Error("INDEX_MODEL_MISMATCH", "知识索引与查询向量模型不一致。", {
      httpStatus: 503,
      publicMessage: "课程知识库与向量模型配置不一致。",
    });
  }
  const client = options.client || createBailianClient(settings, config);
  const queryPlan = planSmartQuery({
    question: input.question,
    taskMode: input.mode,
    chunks: courseIndex.chunks,
  });
  const effectiveTaskMode = queryPlan.originalRequested ? "original" : input.mode;
  const queryVector = await client.embedQuery(queryPlan.embeddingQuery, options.signal);
  const search = hybridSearch({
    courseIndex,
    queryVector,
    question: input.question,
    taskMode: effectiveTaskMode,
    queryPlan,
  });
  const evidence = evaluateEvidence(search, config);
  if (!evidence.sufficient) {
    return {
      status: "insufficient_evidence",
      answer: "课程资料中未检索到足够可靠的依据。您可以换一种问法，或补充具体章节、页码和术语。",
      taskMode: effectiveTaskMode,
      authorityMode: search.authorityMode,
      confidence: "low",
      sources: [],
      verbatimVerified: false,
      retrievalStrategy: "smart_hybrid_v2",
    };
  }

  if (queryPlan.originalRequested) {
    const corpus = options.corpus || await loadTextbookCorpus(projectRoot, config);
    let original;
    try {
      original = selectOriginalPassage({ corpus, search, plan: queryPlan, config });
    } catch (error) {
      if (error instanceof Step4Error && error.code === "VERBATIM_NOT_FOUND") {
        return {
          status: "insufficient_evidence",
          answer: "课程资料中未找到与该问题对应的可核验教材原文。请补充Unit、系统页码或中英文术语。",
          taskMode: "original",
          authorityMode: search.authorityMode,
          confidence: "low",
          sources: [],
          verbatimVerified: false,
          retrievalStrategy: "smart_hybrid_v2",
        };
      }
      throw error;
    }
    let parsedOriginal;
    let lastOriginalError;
    for (let attempt = 0; attempt < config.generation.max_format_attempts; attempt += 1) {
      const messages = buildOriginalMessages({
        question: input.question,
        history: input.history,
        passage: original.passage,
        source: original.source,
      });
      const rawAnswer = await client.generateJson(messages, options.signal);
      try {
        parsedOriginal = parseOriginalAnswer(rawAnswer, original, config);
        break;
      } catch (error) {
        lastOriginalError = error;
      }
    }
    if (!parsedOriginal) throw lastOriginalError;
    return {
      status: parsedOriginal.status,
      answer: parsedOriginal.answer,
      taskMode: "original",
      authorityMode: search.authorityMode,
      confidence: evidence.confidence,
      sources: [sourceDto(original.source)],
      verbatimVerified: true,
      retrievalStrategy: "smart_hybrid_v2",
    };
  }
  const evidenceSources = buildEvidenceSources(search, config);
  if (evidenceSources.length === 0) {
    throw new Step4Error("EVIDENCE_EMPTY", "检索结果无法形成引用。", {
      httpStatus: 502,
      publicMessage: "课程资料引用生成失败，请重试。",
    });
  }

  let parsedAnswer;
  let lastError;
  for (let attempt = 0; attempt < config.generation.max_format_attempts; attempt += 1) {
    const messages = buildGroundedMessages({
      question: input.question,
      history: input.history,
      taskMode: input.mode,
      authorityMode: search.authorityMode,
      sources: evidenceSources,
      repair: attempt > 0,
    });
    const rawAnswer = await client.generateJson(messages, options.signal);
    try {
      parsedAnswer = parseGroundedAnswer(rawAnswer, evidenceSources, config);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!parsedAnswer) throw lastError;
  const used = new Set(parsedAnswer.usedSourceIds);
  return {
    status: parsedAnswer.status,
    answer: parsedAnswer.answer,
    taskMode: input.mode,
    authorityMode: search.authorityMode,
    confidence: parsedAnswer.status === "answered" ? evidence.confidence : "low",
    sources: parsedAnswer.status === "answered"
      ? evidenceSources.filter((source) => used.has(source.id)).map(sourceDto)
      : [],
    verbatimVerified: false,
    retrievalStrategy: "smart_hybrid_v2",
  };
}

export async function getQuestionServiceStatus(options = {}) {
  const projectRoot = options.projectRoot || resolveProjectRoot();
  const config = options.config || loadChatConfig(projectRoot);
  const index = await loadCourseIndex(projectRoot);
  let providerConfigured = true;
  try {
    resolveBailianSettings(config);
  } catch {
    providerConfigured = false;
  }
  return {
    status: providerConfigured ? "ready" : "needs_configuration",
    package_version: config.package_version,
    provider_configured: providerConfigured,
    index: {
      ready: true,
      chunks: index.meta.chunk_count,
      embedding_model: index.meta.embedding_model,
      dimensions: index.meta.dimensions,
      freeze_version: index.meta.freeze_version,
      step2_build_version: index.meta.step2_build_version,
    },
    chat_model: String(process.env.KB_CHAT_MODEL || config.generation.model),
  };
}
