import "server-only";

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { loadChatConfig, resolveProjectRoot } from "../step4/config.mjs";
import { Step4Error } from "../step4/errors.mjs";

const CORPUS_SYMBOL = Symbol.for("surveying-ai-teacher.step6.textbook-corpus-cache");

function corpusCache() {
  if (!globalThis[CORPUS_SYMBOL]) globalThis[CORPUS_SYMBOL] = new Map();
  return globalThis[CORPUS_SYMBOL];
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractPageText(markdown) {
  const marker = "## 页面提取文字";
  const position = markdown.indexOf(marker);
  if (position < 0) throw new SyntaxError("page text marker missing");
  return markdown.slice(position + marker.length).trim();
}

async function loadAndVerifyTextbookCorpus(projectRoot, config) {
  const step2Root = path.resolve(projectRoot, config.corpus.step2_root);
  const pagesIndexPath = path.resolve(step2Root, config.corpus.pages_index);
  const unitsIndexPath = path.resolve(step2Root, config.corpus.units_index);
  let pageLines;
  let units;
  try {
    [pageLines, units] = await Promise.all([
      fsp.readFile(pagesIndexPath, "utf8"),
      fsp.readFile(unitsIndexPath, "utf8").then(JSON.parse),
    ]);
  } catch (error) {
    throw new Step4Error("TEXTBOOK_CORPUS_NOT_READY", "教材全文索引缺失。", {
      cause: error,
      httpStatus: 503,
      publicMessage: "教材全文检索资料尚未准备好。",
    });
  }

  const errors = [];
  const metadata = [];
  for (const [lineNumber, line] of pageLines.split(/\r?\n/gu).entries()) {
    if (!line.trim()) continue;
    try {
      const page = JSON.parse(line);
      if (
        page.source_id === "TB-001" &&
        page.source_type === "textbook" &&
        page.retrieval_status === "include"
      ) metadata.push(page);
    } catch {
      errors.push(`page_json:${lineNumber + 1}`);
    }
  }
  metadata.sort((left, right) => left.system_page - right.system_page);
  if (metadata.length !== config.corpus.expected_textbook_pages) {
    errors.push(`textbook_pages:${metadata.length}`);
  }
  if (!Array.isArray(units) || units.length !== config.corpus.expected_units) {
    errors.push(`units:${Array.isArray(units) ? units.length : "invalid"}`);
  }

  const pages = await Promise.all(metadata.map(async (meta) => {
    try {
      const markdownPath = path.resolve(step2Root, meta.page_text_path);
      const markdown = await fsp.readFile(markdownPath, "utf8");
      const text = extractPageText(markdown);
      if (sha256(text) !== meta.text_sha256) errors.push(`text_sha256:${meta.page_id}`);
      const context = Array.isArray(meta.contexts) ? meta.contexts[0] : null;
      return Object.freeze({
        pageId: meta.page_id,
        page: meta.system_page,
        citation: meta.citation,
        unit: Number.isInteger(context?.unit) ? context.unit : null,
        section: context?.section || null,
        chunkIds: Object.freeze(Array.isArray(meta.chunk_ids) ? [...meta.chunk_ids] : []),
        text,
        normalizedText: text.normalize("NFKC").replace(/\s+/gu, " ").trim(),
      });
    } catch {
      errors.push(`page_file:${meta.page_id}`);
      return null;
    }
  }));

  if (errors.length > 0) {
    throw new Step4Error(
      "TEXTBOOK_CORPUS_INTEGRITY_FAILED",
      `教材全文完整性检查失败：${errors.slice(0, 12).join(",")}`,
      {
        httpStatus: 503,
        publicMessage: "教材全文完整性检查未通过。",
      },
    );
  }

  const verifiedPages = pages.filter(Boolean);
  const byPage = new Map(verifiedPages.map((page) => [page.page, page]));
  const pagesByUnit = new Map();
  for (const unit of units) {
    const candidatePages = verifiedPages.filter((page) =>
      page.page >= unit.start_page && page.page <= unit.end_page,
    );
    pagesByUnit.set(unit.unit, Object.freeze(candidatePages));
  }
  return Object.freeze({
    pages: Object.freeze(verifiedPages),
    byPage,
    units: Object.freeze(units.map((unit) => Object.freeze({ ...unit }))),
    unitByNumber: new Map(units.map((unit) => [unit.unit, unit])),
    pagesByUnit,
    projectRoot,
  });
}

export async function loadTextbookCorpus(
  projectRoot = resolveProjectRoot(),
  config = loadChatConfig(projectRoot),
) {
  const cache = corpusCache();
  if (!cache.has(projectRoot)) {
    const pending = loadAndVerifyTextbookCorpus(projectRoot, config).catch((error) => {
      cache.delete(projectRoot);
      throw error;
    });
    cache.set(projectRoot, pending);
  }
  return cache.get(projectRoot);
}

export function clearTextbookCorpusCacheForTests() {
  corpusCache().clear();
}
