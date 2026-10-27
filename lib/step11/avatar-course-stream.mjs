import "server-only";

import { createBailianClient } from "../step4/bailian.mjs";
import { loadChatConfig, resolveBailianSettings, resolveProjectRoot } from "../step4/config.mjs";
import { Step4Error } from "../step4/errors.mjs";
import { loadCourseIndex } from "../step4/index-store.mjs";
import {
  buildEvidenceSources,
  evaluateEvidence,
  hybridSearch,
} from "../step4/retrieval.mjs";
import { planSmartQuery } from "../step6/query-planner.mjs";

function cleanMessageContent(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .filter((item) => item && typeof item === "object" && item.type === "text")
    .map((item) => String(item.text || ""))
    .join("\n")
    .trim();
}

export function extractAvatarConversation(messages) {
  if (!Array.isArray(messages)) throw new Step4Error("AVATAR_MODEL_REQUEST_INVALID", "messages必须是数组。", { httpStatus: 400 });
  const normalized = messages
    .filter((item) => item && typeof item === "object" && ["user", "assistant"].includes(item.role))
    .map((item) => ({ role: item.role, content: cleanMessageContent(item.content) }))
    .filter((item) => item.content);
  const lastUserIndex = normalized.findLastIndex((item) => item.role === "user");
  if (lastUserIndex < 0) {
    throw new Step4Error("AVATAR_MODEL_REQUEST_INVALID", "没有找到学生问题。", {
      httpStatus: 400,
      publicMessage: "没有收到有效的学生问题。",
    });
  }
  const question = normalized[lastUserIndex].content.slice(0, 4_000);
  const history = normalized
    .slice(Math.max(0, lastUserIndex - 6), lastUserIndex)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 1_200) }));
  return { question, history };
}

function buildSpokenGroundedMessages({ question, history, sources }) {
  const system = [
    "你是山西能源学院《测绘专业外语》课程的AI数字教师。",
    "你只能依据本次给出的课程证据回答，不得用外部知识补齐课程事实、术语译法或教材表述。",
    "先直接回答学生问题，再做简短解释。语言应适合真人教师口头讲授，句子短而自然，中英文测绘术语发音友好。",
    "不要输出Markdown表格、标题符号、URL、参考文献列表或[S1]这类机器引用编号，因为答案将被实时语音合成。",
    "如证据无法支持答案，请明确说课程资料中未检索到足够依据，并建议学生补充Unit、页码或术语。",
    "一般控制在600个汉字以内；翻译、专业词汇和原理必须忠实于证据。",
  ].join("\n");
  const data = {
    conversation_history_for_reference_only: history,
    current_student_question: question,
    course_evidence: sources.map((source) => ({
      citation: source.citation,
      content: source.content,
    })),
  };
  return [
    { role: "system", content: system },
    { role: "user", content: `请基于以下课程数据回答：\n${JSON.stringify(data)}` },
  ];
}

async function openBailianStream(settings, config, messages, signal, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${settings.compatibleBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.chatModel,
        messages,
        temperature: 0.1,
        max_tokens: Math.min(900, Number(config.generation.max_tokens || 900)),
        stream: true,
        enable_search: false,
        enable_thinking: false,
      }),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    throw new Step4Error("AVATAR_MODEL_NETWORK_ERROR", "数字教师流式模型连接失败。", {
      cause: error,
      httpStatus: 503,
      publicMessage: "课程回答服务暂时无法连接。",
    });
  }
  if (!response.ok || !response.body) {
    throw new Step4Error("AVATAR_MODEL_PROVIDER_FAILED", `数字教师流式模型请求失败：${response.status}`, {
      httpStatus: response.status === 429 ? 429 : 503,
      publicMessage: response.status === 429 ? "当前同时提问人数较多，请稍后再试。" : "课程回答服务暂时不可用。",
    });
  }
  return response;
}

export async function* parseOpenAIContentStream(response) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const content = parsed?.choices?.[0]?.delta?.content;
      if (typeof content === "string" && content) yield content;
    }
    if (done) break;
  }
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    try {
      const parsed = JSON.parse(tail.slice(5).trim());
      const content = parsed?.choices?.[0]?.delta?.content;
      if (typeof content === "string" && content) yield content;
    } catch {
      // Ignore an incomplete provider trailer; [DONE] carries no user-visible text.
    }
  }
}

export async function* streamAvatarCourseAnswer(input, options = {}) {
  const projectRoot = options.projectRoot || resolveProjectRoot();
  const config = options.config || loadChatConfig(projectRoot);
  const courseIndex = options.courseIndex || await loadCourseIndex(projectRoot);
  const settings = options.settings || resolveBailianSettings(config);
  const client = options.client || createBailianClient(settings, config, { fetchImpl: options.fetchImpl });
  const taskMode = input.mode || "auto";
  const queryPlan = planSmartQuery({
    question: input.question,
    taskMode,
    chunks: courseIndex.chunks,
  });
  const queryVector = await client.embedQuery(queryPlan.embeddingQuery, options.signal);
  const search = hybridSearch({
    courseIndex,
    queryVector,
    question: input.question,
    taskMode,
    queryPlan,
  });
  const evidence = evaluateEvidence(search, config);
  if (!evidence.sufficient) {
    yield "课程资料中暂时没有检索到足够可靠的依据。你可以告诉我具体的Unit、教材页码或专业术语，我再为你准确讲解。";
    return;
  }
  const sources = buildEvidenceSources(search, config);
  if (!sources.length) {
    yield "课程资料检索到了相关内容，但当前无法形成可靠的回答依据。请换一种问法再试一次。";
    return;
  }
  const messages = buildSpokenGroundedMessages({
    question: input.question,
    history: input.history || [],
    sources,
  });
  const response = await openBailianStream(settings, config, messages, options.signal, options.fetchImpl);
  for await (const content of parseOpenAIContentStream(response)) yield content;
}
