import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "fflate";

const KNOWLEDGE_FILE = path.join(process.cwd(), "lib", "cloud", "knowledge-chunks.jsonl.gz.b64");

const STOP_TOKENS = new Set([
  "what", "is", "are", "the", "a", "an", "of", "to", "and", "in", "for", "with",
  "请", "什么", "如何", "哪些", "一个", "本课", "课程", "结合", "内容", "进行", "解释",
]);

let cachedChunks;

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function loadKnowledgeChunks() {
  if (cachedChunks) return cachedChunks;
  const compressedKnowledge = readFileSync(KNOWLEDGE_FILE, "utf8");
  const text = new TextDecoder().decode(gunzipSync(decodeBase64(compressedKnowledge.trim())));
  cachedChunks = Object.freeze(text.split(/\r?\n/u).filter(Boolean).map((line) => Object.freeze(JSON.parse(line))));
  if (!cachedChunks.length || cachedChunks.some(c => !c.id || !c.content || !c.attributes?.source_type)) throw new Error("课程知识库完整性检查未通过。");
  return cachedChunks;
}

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
  if (!tokens.length) return 0;
  const haystack = String(document || "").normalize("NFKC").toLowerCase();
  let matched = 0;
  let total = 0;
  for (const token of tokens) {
    const weight = token.length >= 5 ? 2.4 : token.length >= 3 ? 1.7 : token.length >= 2 ? 1.1 : 0.35;
    total += weight;
    if (haystack.includes(token)) matched += weight;
  }
  return total ? matched / total : 0;
}

function sourceTypesForQuestion(question, mode) {
  if (mode && mode !== "auto") return new Set(["textbook"]);
  if (/学时|学分|考核|成绩|课程目标|及格|大纲|过程性|终结性/u.test(question)) return new Set(["syllabus"]);
  if (/第\s*(?:\d+|几)\s*周|周次|教学进度|哪一周|日期安排/u.test(question)) return new Set(["schedule"]);
  if (/教案|课件|课堂活动|教学方法|如何讲授/u.test(question)) return new Set(["lesson_plan", "slides"]);
  return new Set(["textbook"]);
}

export function retrieveKnowledge(question, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.limit || 6)));
  const allowed = options.sourceTypes
    ? new Set(options.sourceTypes)
    : sourceTypesForQuestion(question, options.mode || "auto");
  const normalized = String(question || "").normalize("NFKC").toLowerCase();
  const unit = Number(normalized.match(/(?:unit|第)\s*(\d{1,2})/iu)?.[1] || 0);
  return loadKnowledgeChunks()
    .filter((chunk) => allowed.has(chunk.attributes?.source_type))
    .map((chunk) => {
      const searchText = String(chunk.search_text || `${chunk.content || ""} ${chunk.citation || ""}`);
      const lexical = lexicalSimilarity(question, searchText);
      const unitBonus = unit && Number(chunk.attributes?.unit) === unit ? 0.35 : 0;
      const exactBonus = normalized.length >= 2 && searchText.normalize("NFKC").toLowerCase().includes(normalized) ? 0.5 : 0;
      const authority = Number(chunk.attributes?.authority_rank || 0) / 1000;
      return { chunk, score: lexical + unitBonus + exactBonus + authority };
    })
    .filter((item) => item.score > 0.04)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function retrieveKnowledgeWithUploads(question, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.limit || 6)));
  const builtin = retrieveKnowledge(question, { ...options, limit: Math.min(10, limit * 2) });
  const explicitTypes = options.sourceTypes ? new Set(options.sourceTypes) : null;
  const includeUploads = explicitTypes ? explicitTypes.has("teacher_upload") : sourceTypesForQuestion(question, options.mode || "auto").has("textbook");
  if (!includeUploads) return builtin.slice(0, limit);
  const { listActiveKnowledgeChunks } = await import("../step17/knowledge-store.mjs");
  const normalized = String(question || "").normalize("NFKC").toLowerCase();
  const uploaded = (await listActiveKnowledgeChunks()).map((chunk) => {
    const searchText = String(chunk.search_text || `${chunk.content || ""} ${chunk.citation || ""}`);
    const lexical = lexicalSimilarity(question, searchText);
    const exactBonus = normalized.length >= 2 && searchText.normalize("NFKC").toLowerCase().includes(normalized) ? 0.5 : 0;
    const authority = Number(chunk.attributes?.authority_rank || 0) / 1000;
    return { chunk, score: lexical + exactBonus + authority };
  }).filter((item) => item.score > 0.04);
  return [...builtin, ...uploaded].sort((left, right) => right.score - left.score).slice(0, limit);
}

export function sourceDtos(matches) {
  const seen = new Set();
  const sources = [];
  for (const match of matches) {
    const citation = String(match.chunk.citation || "课程资料");
    if (seen.has(citation)) continue;
    seen.add(citation);
    sources.push({
      id: `S${sources.length + 1}`,
      citation,
      chunk_ids: [String(match.chunk.chunk_id || "")].filter(Boolean),
      source_type: String(match.chunk.attributes?.source_type || ""),
      page: Number.isFinite(Number(match.chunk.attributes?.page)) ? Number(match.chunk.attributes.page) : null,
      unit: Number.isFinite(Number(match.chunk.attributes?.unit)) ? Number(match.chunk.attributes.unit) : null,
      section: match.chunk.attributes?.section ? String(match.chunk.attributes.section) : null,
      excerpt: String(match.chunk.content || "").slice(0, 900),
      content: String(match.chunk.content || "").slice(0, 2600),
      score: match.score,
    });
    if (sources.length >= 6) break;
  }
  return sources;
}

export function findGlossaryEntry(selection, sentence = "") {
  const wanted = String(selection || "").normalize("NFKC").toLowerCase().replace(/[“”‘’"'\x60]/gu, "").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
  if (!wanted) return null;
  const matches = retrieveKnowledge(`${selection} ${sentence}`, { sourceTypes: ["textbook"], limit: 8 });
  for (const { chunk } of matches) {
    for (const rawLine of String(chunk.content || "").split(/\r?\n/u)) {
      const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/u, "").trim();
      const pair = line.match(/^(.{1,180}?)\s*[:：]\s*(.{1,260})$/u);
      if (!pair) continue;
      const term = pair[1].normalize("NFKC").toLowerCase().replace(/[“”‘’"'\x60]/gu, "").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
      if (term !== wanted) continue;
      const translation = pair[2].trim().replace(/[,，;；]\s*$/u, "");
      if (!/[\p{Script=Han}]/u.test(translation)) continue;
      return { term: pair[1].trim(), translation, citation: String(chunk.citation || "教材课程资料"), chunk };
    }
  }
  return null;
}
