import { Step4Error } from "../step4/errors.mjs";

const QUESTION_KINDS = new Set(["vocabulary", "concept", "translation"]);

const FOCUS_INSTRUCTIONS = {
  mixed: "专业词汇、原理理解和中英翻译题应合理混合。",
  vocabulary: "全部考查教材中的中英专业术语、术语含义或语境辨析。",
  concept: "全部考查教材正文中的测绘概念、原理、方法或应用。",
};

export function buildQuizMessages({ unit, count, focus, sources, nonce }) {
  const system = [
    "你是山西能源学院《测绘专业外语》课程的命题教师。",
    "只能依据本次提供的指定Unit教材原文出题，不得使用课件、外部知识或常识补充。",
    `必须生成恰好${count}道互不重复的单项选择题，每题4个选项且只有1个正确答案。`,
    FOCUS_INSTRUCTIONS[focus] || FOCUS_INSTRUCTIONS.mixed,
    "题干不得直接泄露正确答案；错误选项应有迷惑性但不能存在第二个正确答案。",
    "answer_index使用0、1、2、3表示正确选项；explanation必须说明答案依据并引用给定[S1]等来源。",
    "只输出一个合法JSON对象，不要输出Markdown代码围栏。",
    '格式：{"questions":[{"kind":"vocabulary|concept|translation","stem":"题干","options":["选项A","选项B","选项C","选项D"],"answer_index":0,"explanation":"答案依据。[S1]"}]}。',
  ].join("\n");
  const payload = {
    unit: unit.unit,
    unit_title: unit.unit_title,
    randomization_nonce: nonce,
    textbook_evidence: sources.map((source) => ({
      id: source.id,
      citation: source.citation,
      content: source.content,
    })),
  };
  return [
    { role: "system", content: system },
    { role: "user", content: `请根据以下JSON教材证据随机命题：\n${JSON.stringify(payload)}` },
  ];
}

function extractJson(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("JSON object not found");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function cleanText(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function parseGeneratedQuiz(text, { count, sources }) {
  let parsed;
  try {
    parsed = extractJson(text);
  } catch (error) {
    throw new Step4Error("QUIZ_FORMAT_INVALID", "章节测试不是有效JSON。", {
      cause: error,
      httpStatus: 502,
      publicMessage: "章节测试格式校验失败，请重新随机出题。",
    });
  }
  if (!Array.isArray(parsed?.questions) || parsed.questions.length !== count) {
    throw new Step4Error("QUIZ_FORMAT_INVALID", "章节测试题量不正确。", {
      httpStatus: 502,
      publicMessage: "章节测试题量生成不完整，请重新随机出题。",
    });
  }
  const allowedSources = new Set(sources.map((source) => source.id));
  const stemKeys = new Set();
  const questions = parsed.questions.map((value, index) => {
    const kind = QUESTION_KINDS.has(value?.kind) ? value.kind : "concept";
    const stem = cleanText(value?.stem, 500);
    const options = Array.isArray(value?.options)
      ? value.options.map((option) => cleanText(option, 300))
      : [];
    const answerIndex = Number(value?.answer_index);
    const explanation = cleanText(value?.explanation, 1600).replace(/【S(\d+)】/gu, "[S$1]");
    const markers = [...explanation.matchAll(/\[S\d+\]/gu)].map((match) => match[0].slice(1, -1));
    const optionKeys = new Set(options.map((option) => option.normalize("NFKC").toLowerCase()));
    const stemKey = stem.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
    if (
      !stem ||
      stemKeys.has(stemKey) ||
      options.length !== 4 ||
      options.some((option) => !option) ||
      optionKeys.size !== 4 ||
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex > 3 ||
      !explanation ||
      markers.length === 0 ||
      markers.some((marker) => !allowedSources.has(marker))
    ) {
      throw new Step4Error("QUIZ_FORMAT_INVALID", `第${index + 1}题格式无效。`, {
        httpStatus: 502,
        publicMessage: "章节测试内容校验失败，请重新随机出题。",
      });
    }
    stemKeys.add(stemKey);
    return Object.freeze({
      id: `Q${index + 1}`,
      kind,
      stem,
      options: Object.freeze(options),
      answerIndex,
      explanation,
      sourceIds: Object.freeze([...new Set(markers)]),
    });
  });
  return Object.freeze(questions);
}
