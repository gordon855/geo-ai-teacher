import "server-only";

function clean(value, maximum = 4_000) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function stripCodeFence(value) {
  return clean(value, 20_000)
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
}

function comparable(value) {
  return clean(value, 8_000)
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value) {
  const normalized = comparable(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  const result = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function overlapScore(studentAnswer, standardAnswer) {
  const actual = comparable(studentAnswer);
  const expected = comparable(standardAnswer);
  if (!actual || !expected) return 0;
  if (actual === expected || expected.includes(actual) && actual.length >= Math.min(12, expected.length)) return 0.92;
  const actualGrams = bigrams(actual);
  const expectedGrams = bigrams(expected);
  let intersection = 0;
  for (const gram of actualGrams) if (expectedGrams.has(gram)) intersection += 1;
  const dice = (2 * intersection) / Math.max(1, actualGrams.size + expectedGrams.size);
  const englishTerms = [...new Set(clean(standardAnswer).toLowerCase().match(/[a-z][a-z-]{2,}/gu) || [])];
  const matchedTerms = englishTerms.filter((term) => clean(studentAnswer).toLowerCase().includes(term)).length;
  const termCoverage = englishTerms.length ? matchedTerms / englishTerms.length : dice;
  return Math.max(0, Math.min(1, dice * 0.72 + termCoverage * 0.28));
}

function roundedScore(value) {
  return Math.round(Math.max(0, Math.min(10, Number(value) || 0)) * 10) / 10;
}

export function localColdCallEvaluation({ studentAnswer, standardAnswer, rubric, source }) {
  const answer = clean(studentAnswer, 2_000);
  const standard = clean(standardAnswer, 4_000);
  const similarity = overlapScore(answer, standard);
  const score = roundedScore(similarity * 10);
  const verdict = score >= 8.5 ? "基本正确" : score >= 5 ? "部分正确" : "需要纠正";
  const correction = score >= 8.5
    ? "回答与参考答案的核心表述基本一致，请再按照课程术语和完整句式组织答案。"
    : `请依据参考答案补全或改正：${standard}`;
  return {
    score,
    verdict,
    feedback: `已收到回答。当前采用课程文本匹配进行初步核对，匹配结果为“${verdict}”；该分数只作课堂提示，仍由教师确认。`,
    correction,
    missingPoints: rubric ? [clean(rubric, 500)] : [],
    standardAnswer: standard,
    rubric: clean(rubric, 800),
    source: clean(source, 500),
    generatedBy: "course-text-match-v15",
    teacherReviewRequired: true,
  };
}

function normalizeGeneratedEvaluation(parsed, fallback) {
  const missingPoints = Array.isArray(parsed?.missingPoints)
    ? parsed.missingPoints.map((item) => clean(item, 260)).filter(Boolean).slice(0, 5)
    : fallback.missingPoints;
  return {
    ...fallback,
    score: roundedScore(parsed?.score),
    verdict: clean(parsed?.verdict, 40) || fallback.verdict,
    feedback: clean(parsed?.feedback, 600) || fallback.feedback,
    correction: clean(parsed?.correction, 800) || fallback.correction,
    missingPoints,
    generatedBy: "course-ai-correction-v15",
  };
}

export async function evaluateColdCallAnswer(input, options = {}) {
  const fallback = localColdCallEvaluation(input);
  try {
    const { completeMessages } = await import("../cloud/ai-service.mjs");
    const generated = await completeMessages([
      {
        role: "system",
        content: [
          "你是《测绘专业外语》课堂提问纠错助手。只评价学生对当前指定题目的回答。",
          "严格依据标准答案、评分要点和教材来源，不得补造教材页码。",
          "指出答对之处、错误或遗漏，并给出可直接朗读的规范改正。分数为0到10，只作课堂提示，教师最终确认。",
          "只输出JSON，不得使用Markdown。字段：score、verdict、feedback、correction、missingPoints（字符串数组）。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `题目：${clean(input.question, 2_000)}`,
          `学生回答：${clean(input.studentAnswer, 2_000)}`,
          `标准答案：${clean(input.standardAnswer, 4_000)}`,
          `评分要点：${clean(input.rubric, 1_000)}`,
          `教材来源：${clean(input.source, 500)}`,
        ].join("\n\n"),
      },
    ], { signal: options.signal, maxTokens: 900, temperature: 0.05 });
    if (!generated) return fallback;
    return normalizeGeneratedEvaluation(JSON.parse(stripCodeFence(generated)), fallback);
  } catch {
    return fallback;
  }
}

export function timedOutColdCallEvaluation({ standardAnswer, rubric, source }) {
  return {
    score: 0,
    verdict: "超时未回答",
    feedback: "建议回答时间内没有检测到学生回答，AI教师现在给出标准答案。",
    correction: `标准答案：${clean(standardAnswer, 4_000)}`,
    missingPoints: rubric ? [clean(rubric, 500)] : [],
    standardAnswer: clean(standardAnswer, 4_000),
    rubric: clean(rubric, 800),
    source: clean(source, 500),
    generatedBy: "cold-call-timeout-v15",
    teacherReviewRequired: true,
  };
}
