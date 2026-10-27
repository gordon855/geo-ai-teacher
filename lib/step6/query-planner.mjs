const ORIGINAL_PATTERNS = [
  /教材(?:原文|原话|英文原文)/iu,
  /(?:输出|给出|引用|摘录|查找|找到|显示).{0,12}(?:原文|原话|英文段落|完整英文)/iu,
  /(?:原文|英文定义).{0,12}(?:是什么|怎么说|如何表述|如何描述)/iu,
  /(?:verbatim|original\s+(?:text|passage|wording))/iu,
];

const GLOSSARY_TITLE = /#\s*(?:Words\s+and\s+Expressions|Vocabulary)|词汇表/iu;

function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function addTerm(map, key, entry) {
  const normalized = normalize(key).toLowerCase();
  if (normalized.length < 2) return;
  const list = map.get(normalized) || [];
  if (!list.some((item) => item.english === entry.english && item.chinese === entry.chinese)) {
    list.push(entry);
    map.set(normalized, list);
  }
}

export function isGlossaryChunk(chunk) {
  return GLOSSARY_TITLE.test(String(chunk?.content || ""));
}

export function buildGlossaryDictionary(chunks) {
  const byTerm = new Map();
  const entries = [];
  for (const chunk of chunks || []) {
    if (chunk?.attributes?.source_type !== "textbook" || !isGlossaryChunk(chunk)) continue;
    const unit = Number(chunk.attributes?.unit);
    for (const rawLine of String(chunk.content || "").split(/\r?\n/gu)) {
      const line = normalize(rawLine);
      const match = /^([^:#]{2,100}):\s*(.{1,180})$/u.exec(line);
      if (!match || !/[a-z]/iu.test(match[1])) continue;
      const english = normalize(match[1]).replace(/[;,，；]+$/u, "");
      const chinese = normalize(match[2]).replace(/[;,，；]+$/u, "");
      if (!english || !chinese || english.length > 100 || chinese.length > 180) continue;
      const entry = Object.freeze({
        english,
        chinese,
        unit: Number.isInteger(unit) && unit > 0 ? unit : null,
        page: Number.isInteger(chunk.attributes?.page) ? chunk.attributes.page : null,
        chunkId: chunk.chunk_id,
      });
      entries.push(entry);
      addTerm(byTerm, english, entry);
      for (const chineseTerm of chinese.split(/[，,；;、/]/gu)) addTerm(byTerm, chineseTerm, entry);
    }
  }
  entries.sort((left, right) =>
    (left.unit || 0) - (right.unit || 0) || left.english.localeCompare(right.english),
  );
  return Object.freeze({ entries: Object.freeze(entries), byTerm });
}

export function inferRequestedUnit(question) {
  const value = normalize(question);
  const match = /\bunit\s*[-：:]?\s*(\d{1,2})\b/iu.exec(value)
    || /第\s*(\d{1,2})\s*(?:单元|章|课)/u.exec(value);
  const unit = Number(match?.[1]);
  return Number.isInteger(unit) && unit >= 1 && unit <= 99 ? unit : null;
}

export function inferRequestedPage(question) {
  const value = normalize(question);
  const match = /系统页\s*[-：:]?\s*(\d{1,3})/u.exec(value)
    || /第\s*(\d{1,3})\s*页/u.exec(value);
  const page = Number(match?.[1]);
  return Number.isInteger(page) && page >= 1 && page <= 999 ? page : null;
}

export function isOriginalTextIntent(question, taskMode = "auto") {
  if (taskMode === "original") return true;
  return ORIGINAL_PATTERNS.some((pattern) => pattern.test(String(question || "")));
}

function findGlossaryMatches(question, glossary) {
  const normalizedQuestion = normalize(question).toLowerCase();
  const matches = [];
  for (const [term, entries] of glossary?.byTerm || []) {
    if (!normalizedQuestion.includes(term)) continue;
    for (const entry of entries) {
      matches.push({ ...entry, matchedTerm: term });
    }
  }
  matches.sort((left, right) =>
    right.matchedTerm.length - left.matchedTerm.length ||
    (left.unit || 0) - (right.unit || 0),
  );
  const deduplicated = [];
  const seen = new Set();
  for (const match of matches) {
    const key = `${match.english.toLowerCase()}\u0000${match.chinese}\u0000${match.unit || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(match);
    if (deduplicated.length >= 8) break;
  }
  return deduplicated;
}

export function planSmartQuery({ question, taskMode = "auto", chunks }) {
  const normalizedQuestion = normalize(question);
  const glossary = buildGlossaryDictionary(chunks);
  const glossaryMatches = findGlossaryMatches(normalizedQuestion, glossary);
  const requestedUnit = inferRequestedUnit(normalizedQuestion)
    || glossaryMatches.find((item) => item.unit)?.unit
    || null;
  const requestedPage = inferRequestedPage(normalizedQuestion);
  const originalRequested = isOriginalTextIntent(normalizedQuestion, taskMode);
  const expansions = [];
  const seen = new Set();
  for (const match of glossaryMatches) {
    for (const value of [match.english, match.chinese]) {
      const cleaned = normalize(value);
      const key = cleaned.toLowerCase();
      if (!cleaned || seen.has(key)) continue;
      seen.add(key);
      expansions.push(cleaned);
    }
  }
  const expansionText = expansions.length > 0
    ? `\n教材术语扩展：${expansions.join("；")}`
    : "";
  const locationText = [
    requestedUnit ? `Unit ${requestedUnit}` : "",
    requestedPage ? `系统页${requestedPage}` : "",
  ].filter(Boolean).join("，");
  const intentText = originalRequested
    ? "\n检索目标：教材正文中直接定义或描述该概念的英文原句；不要只检索词汇表。"
    : "";
  const embeddingQuery = `${normalizedQuestion}${expansionText}${locationText ? `\n限定位置：${locationText}` : ""}${intentText}`;
  return Object.freeze({
    originalRequested,
    requestedUnit,
    requestedPage,
    glossaryMatches: Object.freeze(glossaryMatches),
    expansions: Object.freeze(expansions),
    embeddingQuery,
    lexicalQuery: `${normalizedQuestion} ${expansions.join(" ")}`.trim(),
  });
}
