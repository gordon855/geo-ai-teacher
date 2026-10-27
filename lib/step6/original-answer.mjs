import { Step4Error } from "../step4/errors.mjs";
import { lexicalSimilarity } from "../step4/retrieval.mjs";

function normalizeWhitespace(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function pageLooksLikeGlossary(page) {
  return /Words\s+and\s+Expressions|Vocabulary|^[^.!?]{1,80}:\s*[^.!?]{1,80}$/imu.test(page.text);
}

function searchableTerms(plan) {
  const values = [...(plan.expansions || [])];
  for (const match of String(plan.lexicalQuery || "").matchAll(/[a-z][a-z0-9 -]{2,60}/giu)) {
    const value = normalizeWhitespace(match[0]);
    if (value.length >= 3) values.push(value);
  }
  return [...new Set(values.map(normalizeWhitespace).filter((value) => value.length >= 2))]
    .sort((left, right) => right.length - left.length);
}

function findAnchor(text, terms) {
  const lower = text.toLowerCase();
  for (const term of terms) {
    const position = lower.indexOf(term.toLowerCase());
    if (position >= 0) return { position, term };
  }
  return { position: 0, term: "" };
}

function sentenceStart(text, anchor) {
  const punctuation = Math.max(
    text.lastIndexOf(".", anchor),
    text.lastIndexOf("?", anchor),
    text.lastIndexOf("!", anchor),
    text.lastIndexOf("。", anchor),
    text.lastIndexOf("？", anchor),
    text.lastIndexOf("！", anchor),
  );
  if (punctuation < 0) return 0;
  let start = punctuation + 1;
  while (/\s/u.test(text[start] || "")) start += 1;
  return start;
}

function passageEnd(text, start, anchor, sentenceCount, maximum) {
  const limit = Math.min(text.length, start + maximum);
  let cursor = Math.max(anchor, start);
  let found = 0;
  while (cursor < limit) {
    const match = /[.!?。？！](?=\s|$|[A-Z])/gu.exec(text.slice(cursor, limit));
    if (!match) return limit;
    cursor += match.index + 1;
    found += 1;
    if (found >= sentenceCount) return cursor;
  }
  return limit;
}

function extractPassage(page, plan, config) {
  const text = page.normalizedText;
  const terms = searchableTerms(plan);
  const anchor = findAnchor(text, terms);
  let start = sentenceStart(text, anchor.position);
  const maximum = Number(config.original_answer.max_passage_characters);
  let end = passageEnd(
    text,
    start,
    anchor.position,
    Number(config.original_answer.sentences_after_anchor),
    maximum,
  );
  let passage = text.slice(start, end).trim();
  if (passage.length < Number(config.original_answer.minimum_passage_characters)) {
    start = Math.max(0, anchor.position - 180);
    end = Math.min(text.length, start + maximum);
    passage = text.slice(start, end).trim();
  }
  if (!normalizeWhitespace(page.text).includes(normalizeWhitespace(passage))) {
    throw new Step4Error("VERBATIM_VERIFICATION_FAILED", "教材原文未通过服务器核验。", {
      httpStatus: 502,
      publicMessage: "教材原文核验失败，请重试。",
    });
  }
  return passage;
}

function candidatePages({ corpus, search, plan, config }) {
  if (plan.requestedPage) {
    const explicit = corpus.byPage.get(plan.requestedPage);
    return explicit ? [explicit] : [];
  }
  const seen = new Set();
  const candidates = [];
  const add = (page) => {
    if (!page || seen.has(page.page)) return;
    seen.add(page.page);
    candidates.push(page);
  };
  for (const result of search.results) {
    if (result.chunk.attributes?.source_type !== "textbook") continue;
    const pageNumber = Number(result.chunk.attributes?.page);
    const page = corpus.byPage.get(pageNumber);
    add(page);
    const unit = Number(result.chunk.attributes?.unit);
    if (!Number.isInteger(unit)) continue;
    const radius = Number(config.retrieval.neighbor_page_radius);
    for (let offset = -radius; offset <= radius; offset += 1) {
      const neighbor = corpus.byPage.get(pageNumber + offset);
      if (neighbor?.unit === unit) add(neighbor);
    }
  }
  if (plan.requestedUnit) {
    for (const page of corpus.pagesByUnit.get(plan.requestedUnit) || []) add(page);
  }
  return candidates;
}

export function selectOriginalPassage({ corpus, search, plan, config }) {
  const candidates = candidatePages({ corpus, search, plan, config });
  const terms = searchableTerms(plan);
  const ranked = candidates.map((page) => {
    const lower = page.normalizedText.toLowerCase();
    const anchor = findAnchor(page.normalizedText, terms);
    const exactHits = terms.reduce(
      (sum, term) => sum + (lower.includes(term.toLowerCase()) ? Math.min(0.5, term.length / 40) : 0),
      0,
    );
    const definitionWindow = lower.slice(anchor.position, anchor.position + 420);
    const definitionBonus = /\b(?:is|are|means|denotes|originates|consists|defined\s+as|refers\s+to|can\s+be\s+described)\b/iu.test(definitionWindow)
      ? 0.55
      : 0;
    const trailingPenalty = anchor.position > page.normalizedText.length * 0.78 ? 0.55 : 0;
    const searchRank = search.results.findIndex(
      (result) => Number(result.chunk.attributes?.page) === page.page,
    );
    const score =
      lexicalSimilarity(plan.lexicalQuery, page.normalizedText) * 1.5 +
      exactHits +
      definitionBonus -
      trailingPenalty +
      (searchRank >= 0 ? Math.max(0, 0.35 - searchRank * 0.04) : 0) +
      (plan.requestedUnit === page.unit ? 0.2 : 0) -
      (pageLooksLikeGlossary(page) ? 0.7 : 0);
    return { page, score };
  }).sort((left, right) => right.score - left.score || left.page.page - right.page.page);

  const selected = ranked[0]?.page;
  if (!selected || ranked[0].score <= 0) {
    throw new Step4Error("VERBATIM_NOT_FOUND", "没有找到可核验的教材正文。", {
      httpStatus: 200,
      publicMessage: "课程资料中未找到与该问题对应的教材原文。",
    });
  }
  const passage = extractPassage(selected, plan, config);
  return {
    passage,
    verified: true,
    page: selected,
    source: {
      id: "S1",
      citation: selected.citation,
      chunkIds: selected.chunkIds,
      sourceType: "textbook",
      page: selected.page,
      unit: selected.unit,
      section: selected.section,
      content: passage,
    },
  };
}

export function buildOriginalMessages({ question, history, passage, source }) {
  const system = [
    "你是山西能源学院《测绘专业外语》课程的AI虚拟教师。",
    "服务器已经从教材中提取并逐字核验英文原文。你只能翻译和解释给定原文，不得改写、补写或重复生成英文原文。",
    "翻译必须忠实并符合测绘专业术语；解释应适合本科生。不得使用外部知识补齐事实。",
    "translation和explanation中的事实必须使用给定的[S1]引用。",
    "只输出合法JSON对象，不要输出Markdown代码围栏。",
    'JSON格式只能是：{"status":"answered","translation":"中文翻译。[S1]","explanation":"通俗解释。[S1]"}。',
  ].join("\n");
  const payload = {
    conversation_history_for_reference_only: history,
    current_student_question: question,
    server_verified_verbatim_text: passage,
    source: { id: source.id, citation: source.citation },
  };
  return [
    { role: "system", content: system },
    { role: "user", content: `请处理以下JSON数据：\n${JSON.stringify(payload)}` },
  ];
}

function extractJson(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("JSON object not found");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function validateCitations(value, sourceId) {
  const markers = [...String(value || "").matchAll(/\[S\d+\]/gu)].map((match) => match[0]);
  return markers.length > 0 && markers.every((marker) => marker === `[${sourceId}]`);
}

export function parseOriginalAnswer(text, original, config) {
  let parsed;
  try {
    parsed = extractJson(text);
  } catch (error) {
    throw new Step4Error("ANSWER_FORMAT_INVALID", "原文回答不是有效JSON。", {
      cause: error,
      httpStatus: 502,
      publicMessage: "教材原文回答格式校验失败，请重试。",
    });
  }
  const translation = typeof parsed?.translation === "string" ? parsed.translation.trim() : "";
  const explanation = typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";
  if (
    parsed?.status !== "answered" ||
    !translation ||
    !explanation ||
    !validateCitations(translation, original.source.id) ||
    !validateCitations(explanation, original.source.id)
  ) {
    throw new Step4Error("ANSWER_CITATION_INVALID", "原文回答引用无效。", {
      httpStatus: 502,
      publicMessage: "教材原文回答的引用校验失败，请重试。",
    });
  }
  const answer = [
    "【教材英文原文（服务器逐字核验）】",
    `${original.passage} [${original.source.id}]`,
    "",
    "【中文翻译】",
    translation,
    "",
    "【通俗解释】",
    explanation,
  ].join("\n");
  if (answer.length > config.generation.max_answer_characters) {
    throw new Step4Error("ANSWER_FORMAT_INVALID", "原文回答长度异常。", {
      httpStatus: 502,
      publicMessage: "教材原文回答过长，请缩小问题范围后重试。",
    });
  }
  return { status: "answered", answer, usedSourceIds: [original.source.id] };
}
