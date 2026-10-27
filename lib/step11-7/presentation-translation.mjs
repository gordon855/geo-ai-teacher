import "server-only";

import { createBailianClient } from "../step4/bailian.mjs";
import { loadChatConfig, resolveBailianSettings, resolveProjectRoot } from "../step4/config.mjs";
import { loadCourseIndex } from "../step4/index-store.mjs";
import { lexicalSimilarity } from "../step4/retrieval.mjs";

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”‘’"'`]/gu, "")
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

function directGlossaryTranslation(content, selection) {
  const wanted = normalize(selection);
  if (!wanted) return "";
  for (const rawLine of String(content || "").split(/\r?\n/u)) {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/u, "").trim();
    const match = line.match(/^(.{1,180}?)\s*[:：]\s*(.{1,260})$/u);
    if (!match || normalize(match[1]) !== wanted) continue;
    const translation = match[2].trim().replace(/[,，;；]\s*$/u, "");
    if (/\p{Script=Han}/u.test(translation)) return translation;
  }
  return "";
}

function selectEvidence(chunks, selection, sentence) {
  const normalizedSelection = normalize(selection);
  const normalizedSentence = normalize(sentence);
  return chunks
    .filter((chunk) => chunk.attributes?.source_type === "textbook")
    .map((chunk) => {
      const content = String(chunk.content || "");
      const normalizedContent = normalize(content);
      const exact = normalizedSelection.length >= 2 && normalizedContent.includes(normalizedSelection);
      const direct = directGlossaryTranslation(content, selection);
      const bilingual = Boolean(direct || /译文\s*[:：]/u.test(content));
      const selectionScore = lexicalSimilarity(selection, chunk.search_text || content);
      const contextScore = normalizedSentence ? lexicalSimilarity(sentence, chunk.search_text || content) : 0;
      return {
        chunk,
        exact,
        bilingual,
        direct,
        score: (exact ? 2 : 0) + selectionScore + contextScore * .35,
      };
    })
    .filter((item) => item.score >= .18)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

export function findTextbookPresentationEvidence(chunks, selection, sentence = "") {
  const evidence = selectEvidence(chunks, selection, sentence);
  const wordCount = normalize(selection).split(/\s+/u).filter(Boolean).length;
  const sentenceLike = wordCount >= 3 || String(selection).trim().length >= 24;
  const textbookEvidence = evidence.find((item) => item.direct || (sentenceLike && item.exact && item.bilingual)) || null;
  return {
    evidence,
    textbookEvidence,
    sourceKind: textbookEvidence ? "textbook" : "ai",
    directTranslation: textbookEvidence?.direct || "",
  };
}

function parseGeneratedJson(raw) {
  const cleaned = String(raw || "{}").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const parsed = JSON.parse(cleaned);
  const translation = String(parsed.translation || "").trim();
  const contextMeaning = String(parsed.contextMeaning || "").trim();
  const explanation = String(parsed.explanation || "").trim();
  const otherMeanings = Array.isArray(parsed.otherMeanings)
    ? parsed.otherMeanings.slice(0, 8).map((item) => ({
      meaning: String(item?.meaning || "").trim(),
      usage: String(item?.usage || "").trim(),
    })).filter((item) => item.meaning)
    : [];
  if (!translation || !contextMeaning) throw new Error("AI没有生成有效的专业翻译。");
  return { translation, contextMeaning, explanation, otherMeanings };
}

export async function translatePresentationSelection({ selection, sentence, slideNumber, signal }) {
  const projectRoot = resolveProjectRoot();
  const courseIndex = await loadCourseIndex(projectRoot);
  const { evidence, textbookEvidence, directTranslation, sourceKind } = findTextbookPresentationEvidence(courseIndex.chunks, selection, sentence);
  const evidenceText = evidence.map((item, index) => (
    `[教材依据${index + 1}] ${item.chunk.citation}\n${String(item.chunk.content || "").slice(0, 2_800)}`
  )).join("\n\n");
  const config = loadChatConfig(projectRoot);
  const settings = resolveBailianSettings(config);
  const client = createBailianClient(settings, config);
  const system = sourceKind === "textbook"
    ? "你是测绘专业英语教材翻译助手。教材证据中存在所选内容及教材译文。translation必须优先沿用教材的术语和译法；不得把教材没有写出的内容伪称为教材原文。先解释当前句中含义，再列出其他常见含义。"
    : "你是严谨的测绘专业英语翻译助手。教材中没有找到所选内容的明确对应译文。请结合测量学、摄影测量、GNSS、GIS、遥感或工程测量语境给出最贴切的当前含义，再列出该词或短语的其他常见含义。不得声称译文来自教材。";
  const raw = await client.generateJson([
    {
      role: "system",
      content: `${system}\n自动判断语言方向：英文内容译成中文，中文内容译成规范的测绘专业英文。只输出JSON对象，字段为translation、contextMeaning、otherMeanings（数组，每项含meaning和usage）、explanation。不要使用Markdown。`,
    },
    {
      role: "user",
      content: `PPT页码：${slideNumber || "未知"}\n所选词/短语/句子：${selection}\n所在完整句：${sentence || selection}\n${directTranslation ? `教材词汇表明确译法：${directTranslation}\n` : ""}${evidenceText || "未检索到可直接采用的教材译文。"}`,
    },
  ], signal, { temperature: .12, maxTokens: 1_000 });
  const generated = parseGeneratedJson(raw);
  return {
    ...generated,
    translation: directTranslation || generated.translation,
    sourceKind,
    sourceLabel: sourceKind === "textbook" ? "教材译法" : "AI测绘语境翻译",
    citation: textbookEvidence?.chunk.citation || "AI结合当前PPT语境与测绘专业知识生成",
    matchedTextbook: Boolean(textbookEvidence),
  };
}
