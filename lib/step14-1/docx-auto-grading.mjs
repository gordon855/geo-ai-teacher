import "server-only";

import { unzipSync } from "fflate";

const decoder = new TextDecoder();
const MAX_STUDENT_TEXT = 24_000;
const MAX_TEMPLATE_TEXT = 8_000;

function xmlDecode(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function paragraphText(xml) {
  const withSpacing = String(xml || "")
    .replace(/<(?:[\w.-]+:)?tab\b[^>]*\/?\s*>/gu, "\t")
    .replace(/<(?:[\w.-]+:)?(?:br|cr)\b[^>]*\/?\s*>/gu, "\n");
  return [...withSpacing.matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gu)]
    .map((match) => xmlDecode(match[1]))
    .join("")
    .replace(/[ \u00a0]+/gu, " ")
    .replace(/\s*\n\s*/gu, "\n")
    .trim();
}

function documentText(xml) {
  const paragraphs = [...String(xml || "").matchAll(/<(?:[\w.-]+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?p>/gu)]
    .map((match) => paragraphText(match[1]))
    .filter(Boolean);
  return paragraphs.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export function extractDocxText(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let entries;
  try {
    entries = unzipSync(data, { filter: (entry) => /^word\/(?:document|footnotes|endnotes)\.xml$/u.test(entry.name) });
  } catch {
    throw new Error("Word作业无法解压，请确认文件未损坏并重新提交.docx文件。");
  }
  const names = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"];
  const text = names
    .filter((name) => entries[name])
    .map((name) => documentText(decoder.decode(entries[name])))
    .filter(Boolean)
    .join("\n\n");
  if (!text) throw new Error("Word作业中没有识别到可批改的文字；图片型或扫描型内容请转为可编辑文字后重交。");
  return text;
}

function stripCodeFence(value) {
  return String(value || "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
}

function cleanList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").replace(/\s+/gu, " ").trim()).filter(Boolean).slice(0, limit);
}

function criterion(value, maxScore, label) {
  const score = Math.max(0, Math.min(maxScore, Number(value?.score) || 0));
  return {
    label,
    score: Math.round(score * 10) / 10,
    maxScore,
    comment: String(value?.comment || "未提供分项说明。").replace(/\s+/gu, " ").trim().slice(0, 320),
  };
}

function normalizeResult(parsed) {
  const rubric = [
    criterion(parsed?.professionalContent, 40, "专业内容与任务完成度"),
    criterion(parsed?.surveyingTerminology, 25, "测绘术语与行业表达"),
    criterion(parsed?.languageAccuracy, 20, "英语、翻译与句法准确性"),
    criterion(parsed?.formatAndCompleteness, 15, "完整性与格式规范"),
  ];
  const score = Math.round(rubric.reduce((sum, item) => sum + item.score, 0) * 10) / 10;
  return {
    score,
    summary: String(parsed?.summary || "AI已依据作业要求完成初步批改。").replace(/\s+/gu, " ").trim().slice(0, 500),
    strengths: cleanList(parsed?.strengths, 5),
    issues: cleanList(parsed?.issues, 7),
    corrections: cleanList(parsed?.corrections, 7),
    rubric,
  };
}

function feedbackText(result) {
  const lines = [
    "【AI自动批改｜请教师复核】",
    `总评：${result.summary}`,
    "",
    "分项评分：",
    ...result.rubric.map((item) => `- ${item.label}：${item.score}/${item.maxScore}。${item.comment}`),
  ];
  if (result.strengths.length) lines.push("", "主要优点：", ...result.strengths.map((item) => `- ${item}`));
  if (result.issues.length) lines.push("", "主要问题：", ...result.issues.map((item) => `- ${item}`));
  if (result.corrections.length) lines.push("", "修改建议：", ...result.corrections.map((item) => `- ${item}`));
  lines.push("", "说明：本结果由AI依据作业要求、学生Word正文和课程知识生成，教师可修改分数与评语后保存。AI可能出错，请勿跳过教师复核。");
  return lines.join("\n").slice(0, 3_000);
}

export async function gradeDocxAssignment({ title, instructions, templateBytes, submissionBytes, signal }) {
  const [{ completeMessages }, { retrieveKnowledgeWithUploads, sourceDtos }] = await Promise.all([
    import("../cloud/ai-service.mjs"),
    import("../cloud/knowledge.mjs"),
  ]);
  const studentText = extractDocxText(submissionBytes).slice(0, MAX_STUDENT_TEXT);
  const templateText = templateBytes ? extractDocxText(templateBytes).slice(0, MAX_TEMPLATE_TEXT) : "";
  if (studentText.replace(/\s+/gu, "").length < 20) throw new Error("Word作业可识别文字过少，暂时无法自动批改。");

  const matches = await retrieveKnowledgeWithUploads(`${title}\n${instructions}\n${studentText.slice(0, 4_000)}`, { limit: 6 });
  const evidence = sourceDtos(matches).map((source) => `${source.citation}\n${source.content.slice(0, 1_200)}`).join("\n\n");
  const generated = await completeMessages([
    {
      role: "system",
      content: [
        "你是《测绘专业外语》课程的作业批改助手。必须逐项核对教师要求与学生原文，不得因篇幅长、措辞流畅或使用术语而虚高评分。",
        "默认采用100分制：专业内容与任务完成度40分；测绘术语与行业表达25分；英语、翻译与句法准确性20分；完整性与格式规范15分。教师要求是首要依据。",
        "指出可定位的错误和可执行修改建议；不要编造学生未写过的内容、教材页码或引用。无法确认的事实应明确保留。",
        "只输出JSON，不得使用Markdown。字段：professionalContent、surveyingTerminology、languageAccuracy、formatAndCompleteness；四项各含score和comment；另含summary、strengths数组、issues数组、corrections数组。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `作业标题：${String(title || "未命名作业").slice(0, 200)}`,
        `教师要求：${String(instructions || "教师未填写额外要求，请按课程作业规范评价。").slice(0, 5_000)}`,
        `教师附件/模板可识别文字：\n${templateText || "无"}`,
        `学生Word正文：\n${studentText}`,
        `相关课程依据：\n${evidence || "未检索到完全匹配的课程片段；不得因此虚构依据。"}`,
      ].join("\n\n"),
    },
  ], { signal, maxTokens: 1_800, temperature: 0.08 });

  if (!generated) throw new Error("AI自动批改尚未启用。请先在教师工作台“云服务配置”中填写阿里云百炼或DeepSeek密钥。");
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(generated));
  } catch {
    throw new Error("AI返回的批改结果格式不完整，请重新点击自动批改。");
  }
  const result = normalizeResult(parsed);
  return { ...result, feedback: feedbackText(result), extractedCharacters: studentText.length };
}
