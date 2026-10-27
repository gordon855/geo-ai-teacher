export type PresentationHighlightTerm = {
  term: string;
  surveyingTranslation?: string;
};

export type PresentationHighlightResult = {
  matchCount: number;
  matchedTermCount: number;
  mode: "css-highlight" | "fallback" | "none";
};

const HIGHLIGHT_ORANGE = "surveying-term-orange";
const HIGHLIGHT_ORANGE_RED = "surveying-term-orange-red";
const FALLBACK_ATTRIBUTE = "data-surveying-term-highlight";
const STYLE_ATTRIBUTE = "data-surveying-term-highlight-styles";

type TextSegment = {
  node: Text;
  start: number;
  end: number;
};

type Match = {
  start: number;
  end: number;
  term: PresentationHighlightTerm;
  color: "orange" | "orange-red";
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizedTerms(items: PresentationHighlightTerm[]) {
  const seen = new Set<string>();
  return items
    .map((item) => ({
      term: String(item?.term || "").normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 100),
      surveyingTranslation: String(item?.surveyingTranslation || "").trim().slice(0, 160),
    }))
    .filter((item) => {
      const key = item.term.toLowerCase();
      if (item.term.length < 2 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.term.length - left.term.length);
}

function isWordCharacter(value: string | undefined) {
  return Boolean(value && /[A-Za-z0-9_]/u.test(value));
}

function findMatches(text: string, terms: PresentationHighlightTerm[]) {
  const matches: Match[] = [];
  const occupied: Array<{ start: number; end: number }> = [];
  terms.forEach((term, termIndex) => {
    const pattern = term.term.split(/\s+/u).map(escapeRegExp).join("\\s+");
    const expression = new RegExp(pattern, "giu");
    for (const found of text.matchAll(expression)) {
      const start = found.index || 0;
      const end = start + found[0].length;
      const needsLeftBoundary = /^[A-Za-z0-9_]/u.test(term.term);
      const needsRightBoundary = /[A-Za-z0-9_]$/u.test(term.term);
      if ((needsLeftBoundary && isWordCharacter(text[start - 1])) || (needsRightBoundary && isWordCharacter(text[end]))) continue;
      if (occupied.some((range) => start < range.end && end > range.start)) continue;
      occupied.push({ start, end });
      matches.push({ start, end, term, color: termIndex % 2 ? "orange-red" : "orange" });
    }
  });
  return matches.sort((left, right) => left.start - right.start);
}

function textSegments(element: Element) {
  const segments: TextSegment[] = [];
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!node.nodeValue || !parent || parent.closest(`[${FALLBACK_ATTRIBUTE}]`)) return NodeFilter.FILTER_REJECT;
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/u.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const start = text.length;
    text += node.data;
    segments.push({ node, start, end: text.length });
  }
  return { text, segments };
}

function textGroups(root: HTMLElement) {
  const groups = [...root.querySelectorAll("p, text, textPath")].filter((element) => {
    if (!element.textContent?.trim()) return false;
    if (element.tagName.toLowerCase() === "text" && element.querySelector("textPath")) return false;
    if (element.tagName.toLowerCase() !== "p" && element.closest("p")) return false;
    return true;
  });
  return groups.length ? groups : [root];
}

function locateStart(segments: TextSegment[], offset: number) {
  return segments.find((segment) => offset >= segment.start && offset < segment.end) || null;
}

function locateEnd(segments: TextSegment[], offset: number) {
  return segments.find((segment) => offset > segment.start && offset <= segment.end) || null;
}

function rangesFor(root: HTMLElement, terms: PresentationHighlightTerm[]) {
  const orange: Range[] = [];
  const orangeRed: Range[] = [];
  const matchedTerms = new Set<string>();
  for (const group of textGroups(root)) {
    const { text, segments } = textSegments(group);
    if (!text || !segments.length) continue;
    for (const match of findMatches(text, terms)) {
      const start = locateStart(segments, match.start);
      const end = locateEnd(segments, match.end);
      if (!start || !end) continue;
      const range = root.ownerDocument.createRange();
      range.setStart(start.node, match.start - start.start);
      range.setEnd(end.node, match.end - end.start);
      (match.color === "orange" ? orange : orangeRed).push(range);
      matchedTerms.add(match.term.term.toLowerCase());
    }
  }
  return { orange, orangeRed, matchedTerms };
}

function ensureHighlightStyles(document: Document) {
  if (document.head.querySelector(`[${STYLE_ATTRIBUTE}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "true");
  style.textContent = `
    ::highlight(${HIGHLIGHT_ORANGE}) {
      background-color: rgba(251, 146, 60, 0.64);
      text-decoration: underline 2px #ea580c;
      text-underline-offset: 2px;
    }
    ::highlight(${HIGHLIGHT_ORANGE_RED}) {
      background-color: rgba(249, 115, 22, 0.70);
      text-decoration: underline 2px #dc4b18;
      text-underline-offset: 2px;
    }
  `;
  document.head.append(style);
}

function fallbackHighlight(root: HTMLElement, terms: PresentationHighlightTerm[]) {
  const nodes = textGroups(root).flatMap((group) => textSegments(group).segments.map((segment) => segment.node));
  const matchedTerms = new Set<string>();
  let matchCount = 0;
  for (const node of nodes) {
    if (!node.isConnected || !node.data.trim()) continue;
    const matches = findMatches(node.data, terms);
    if (!matches.length) continue;
    const fragment = root.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(node.data.slice(cursor, match.start));
      const marker = root.ownerDocument.createElement("mark");
      marker.setAttribute(FALLBACK_ATTRIBUTE, match.color);
      marker.dataset.surveyingTerm = match.term.term;
      marker.title = match.term.surveyingTranslation ? `${match.term.term}：${match.term.surveyingTranslation}` : match.term.term;
      marker.textContent = node.data.slice(match.start, match.end);
      fragment.append(marker);
      cursor = match.end;
      matchCount += 1;
      matchedTerms.add(match.term.term.toLowerCase());
    }
    fragment.append(node.data.slice(cursor));
    node.replaceWith(fragment);
  }
  return { matchCount, matchedTermCount: matchedTerms.size };
}

export function clearProfessionalTermHighlights(root?: HTMLElement | null) {
  if (typeof CSS !== "undefined" && CSS.highlights) {
    CSS.highlights.delete(HIGHLIGHT_ORANGE);
    CSS.highlights.delete(HIGHLIGHT_ORANGE_RED);
  }
  if (!root) return;
  for (const marker of [...root.querySelectorAll<HTMLElement>(`[${FALLBACK_ATTRIBUTE}]`)]) {
    marker.replaceWith(root.ownerDocument.createTextNode(marker.textContent || ""));
  }
}

export function applyProfessionalTermHighlights(root: HTMLElement, input: PresentationHighlightTerm[]): PresentationHighlightResult {
  clearProfessionalTermHighlights(root);
  const terms = normalizedTerms(input);
  if (!terms.length) return { matchCount: 0, matchedTermCount: 0, mode: "none" };

  if (typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined") {
    ensureHighlightStyles(root.ownerDocument);
    const { orange, orangeRed, matchedTerms } = rangesFor(root, terms);
    if (orange.length) CSS.highlights.set(HIGHLIGHT_ORANGE, new Highlight(...orange));
    if (orangeRed.length) CSS.highlights.set(HIGHLIGHT_ORANGE_RED, new Highlight(...orangeRed));
    return {
      matchCount: orange.length + orangeRed.length,
      matchedTermCount: matchedTerms.size,
      mode: orange.length || orangeRed.length ? "css-highlight" : "none",
    };
  }

  const result = fallbackHighlight(root, terms);
  return { ...result, mode: result.matchCount ? "fallback" : "none" };
}
