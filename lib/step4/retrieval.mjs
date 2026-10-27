import { isGlossaryChunk } from "../step6/query-planner.mjs";

const STOP_TOKENS = new Set([
  "what", "is", "are", "the", "a", "an", "of", "to", "and", "in", "for", "with",
  "请", "什么", "如何", "哪些", "一个", "本课", "课程", "结合", "内容", "进行", "解释",
]);

const KNOWLEDGE_TASKS = new Set([
  "terminology",
  "translation",
  "explanation",
  "original",
  "quiz",
]);

export const CHAT_MODES = new Set(["auto", ...KNOWLEDGE_TASKS]);

export function lexicalTokens(text) {
  const normalized = String(text || "").normalize("NFKC").toLowerCase();
  const tokens = [];
  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9._+-]*/gu)) {
    if (match[0].length > 1 && !STOP_TOKENS.has(match[0])) tokens.push(match[0]);
  }
  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const characters = [...match[0]];
    for (let index = 0; index < characters.length; index += 1) {
      if (!STOP_TOKENS.has(characters[index])) tokens.push(characters[index]);
      if (index + 1 < characters.length) {
        const pair = characters[index] + characters[index + 1];
        if (!STOP_TOKENS.has(pair)) tokens.push(pair);
      }
    }
  }
  return [...new Set(tokens)];
}

export function lexicalSimilarity(query, document) {
  const tokens = lexicalTokens(query);
  if (tokens.length === 0) return 0;
  const haystack = String(document || "").normalize("NFKC").toLowerCase();
  let matched = 0;
  let total = 0;
  for (const token of tokens) {
    const weight = token.length >= 4 ? 2 : token.length >= 2 ? 1.4 : 0.4;
    total += weight;
    if (haystack.includes(token)) matched += weight;
  }
  return total > 0 ? Math.min(1, matched / total) : 0;
}

export function normalizeVector(vector) {
  if (!Array.isArray(vector) && !(vector instanceof Float32Array)) {
    throw new TypeError("query vector must be an array");
  }
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm <= 0) throw new TypeError("query vector is empty");
  const normalized = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) normalized[index] = vector[index] / norm;
  return normalized;
}

export function inferAuthorityMode(question) {
  if (/学时|学分|考核|成绩|课程目标|及格|大纲|过程性|终结性/u.test(question)) return "course_rules";
  if (/第\s*(?:\d+|几)\s*周|周次|教学进度|哪一周|日期安排/u.test(question)) return "schedule";
  if (/教案|课件|课堂活动|教学方法|如何讲授/u.test(question)) return "teaching";
  return "knowledge";
}

export function resolveAuthorityMode(question, taskMode) {
  return KNOWLEDGE_TASKS.has(taskMode) ? "knowledge" : inferAuthorityMode(question);
}

export function hybridSearch({
  courseIndex,
  queryVector,
  question,
  taskMode = "auto",
  queryPlan = null,
}) {
  const { config, chunks, vectors, meta } = courseIndex;
  const authorityMode = resolveAuthorityMode(question, taskMode);
  const allowed = new Set(config.authority[authorityMode] || []);
  const normalizedQuery = normalizeVector(queryVector);
  if (normalizedQuery.length !== meta.dimensions) throw new TypeError("query vector dimensions mismatch");
  const semanticWeight = Number(config.retrieval.semantic_weight);
  const lexicalWeight = Number(config.retrieval.lexical_weight);
  const results = [];

  for (let row = 0; row < chunks.length; row += 1) {
    const chunk = chunks[row];
    if (!allowed.has(chunk.attributes?.source_type)) continue;
    const offset = row * meta.dimensions * 4;
    let semanticScore = 0;
    for (let dimension = 0; dimension < meta.dimensions; dimension += 1) {
      semanticScore += normalizedQuery[dimension] * vectors.readFloatLE(offset + dimension * 4);
    }
    const lexicalQuestion = queryPlan?.lexicalQuery || question;
    const lexicalScore = lexicalSimilarity(lexicalQuestion, chunk.search_text);
    const chunkUnit = Number(chunk.attributes?.unit);
    const requestedUnitBonus =
      queryPlan?.requestedUnit && chunkUnit === queryPlan.requestedUnit
        ? Number(config.retrieval.requested_unit_bonus || 0)
        : 0;
    const normalizedSearchText = String(chunk.search_text || "").normalize("NFKC").toLowerCase();
    const exactTermHits = (queryPlan?.expansions || []).filter((term) =>
      normalizedSearchText.includes(String(term).normalize("NFKC").toLowerCase()),
    ).length;
    const exactTermBonus = Math.min(
      Number(config.retrieval.exact_term_bonus || 0),
      exactTermHits * 0.08,
    );
    const glossary = isGlossaryChunk(chunk);
    const originalAdjustment = queryPlan?.originalRequested
      ? glossary
        ? -Number(config.retrieval.original_glossary_penalty || 0)
        : Number(config.retrieval.original_body_bonus || 0)
      : 0;
    const score =
      semanticWeight * semanticScore +
      lexicalWeight * lexicalScore +
      requestedUnitBonus +
      exactTermBonus +
      originalAdjustment;
    results.push({
      chunk,
      score,
      semanticScore,
      lexicalScore,
      glossary,
      exactTermHits,
    });
  }
  results.sort((left, right) =>
    right.score - left.score ||
    Number(right.chunk.attributes?.authority_rank || 0) - Number(left.chunk.attributes?.authority_rank || 0),
  );
  return {
    authorityMode,
    allowedSourceTypes: [...allowed],
    results: results.slice(0, config.retrieval.top_k),
  };
}

export function evaluateEvidence(search, config) {
  const top = search.results[0];
  if (!top) return { sufficient: false, confidence: "low" };
  const retrieval = config.retrieval;
  const basePass =
    top.score >= retrieval.minimum_score &&
    top.semanticScore >= retrieval.minimum_semantic_score &&
    top.lexicalScore >= retrieval.minimum_borderline_lexical_score;
  const semanticOnlyPass =
    top.score >= retrieval.semantic_only_pass_score &&
    top.semanticScore >= retrieval.minimum_semantic_score;
  const sufficient = basePass || semanticOnlyPass;
  const confidence = !sufficient
    ? "low"
    : top.score >= retrieval.high_confidence_score
      ? "high"
      : top.score >= retrieval.medium_confidence_score
        ? "medium"
        : "guarded";
  return { sufficient, confidence };
}

export function buildEvidenceSources(search, config) {
  const sources = [];
  const byCitation = new Map();
  let totalCharacters = 0;
  for (const result of search.results) {
    const citation = String(result.chunk.citation || "").trim();
    if (!citation) continue;
    const existing = byCitation.get(citation);
    const available = Math.max(0, config.retrieval.max_context_characters - totalCharacters);
    if (available === 0) break;
    const content = String(result.chunk.content || "").slice(
      0,
      Math.min(config.retrieval.max_characters_per_source, available),
    );
    if (existing) {
      if (!existing.chunkIds.includes(result.chunk.chunk_id) && content) {
        const separator = "\n\n";
        const room = Math.max(
          0,
          config.retrieval.max_characters_per_source - existing.content.length - separator.length,
        );
        const addition = content.slice(0, room);
        if (addition) {
          existing.content += separator + addition;
          totalCharacters += separator.length + addition.length;
        }
        existing.chunkIds.push(result.chunk.chunk_id);
      }
      continue;
    }
    if (sources.length >= config.retrieval.max_context_sources) break;
    const source = {
      id: `S${sources.length + 1}`,
      citation,
      chunkIds: [result.chunk.chunk_id],
      sourceType: result.chunk.attributes?.source_type || "unknown",
      page: Number.isInteger(result.chunk.attributes?.page) ? result.chunk.attributes.page : null,
      unit: Number.isInteger(result.chunk.attributes?.unit) && result.chunk.attributes.unit >= 0
        ? result.chunk.attributes.unit
        : null,
      section: result.chunk.attributes?.section || null,
      content,
    };
    sources.push(source);
    byCitation.set(citation, source);
    totalCharacters += content.length;
  }
  return sources;
}
