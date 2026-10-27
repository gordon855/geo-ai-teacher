import "server-only";

import { unzipSync } from "fflate";
import { ensureSchema } from "../step8a/database";
import { runtimeBucket, runtimeDb } from "../cloud/runtime.mjs";
import { indexZipEntries, readZipEntry } from "../step11-9/pptx-slide-text.mjs";

export const MAX_KNOWLEDGE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_DOCUMENTS = 60;
const MAX_ARCHIVE_EXPANDED_BYTES = 80 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 650_000;
const MAX_CHUNKS = 1_200;
const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".docx", ".pptx"]);
const BLOCKED_EXTENSIONS = new Set([".exe", ".dll", ".com", ".bat", ".cmd", ".ps1", ".sh", ".js", ".mjs", ".cjs", ".html", ".htm", ".php", ".jar", ".apk", ".dmg"]);
const decoder = new TextDecoder("utf-8", { fatal: false });
const CACHE_SYMBOL = Symbol.for("surveying-ai-teacher.step17.teacher-knowledge-cache");

function cache() {
  globalThis[CACHE_SYMBOL] ||= { value: null, pending: null };
  return globalThis[CACHE_SYMBOL];
}

function clearCache() {
  cache().value = null;
  cache().pending = null;
}

function extension(name) {
  const match = String(name || "").toLowerCase().match(/\.[a-z0-9]+$/u);
  return match?.[0] || "";
}

function safeName(value, fallback = "课程资料") {
  const withoutPath = String(value || fallback).split(/[\\/]/u).at(-1) || fallback;
  return withoutPath.replace(/[<>:"|?*\u0000-\u001f]/gu, "_").replace(/\s+/gu, " ").trim().slice(0, 180) || fallback;
}

function safeArchiveName(value) {
  const normalized = String(value || "").replace(/\\/gu, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized) || /[\u0000-\u001f]/u.test(normalized)) {
    throw new Error("ZIP中存在不安全的文件路径。");
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error("ZIP中存在目录穿越路径，已拒绝导入。");
  return parts.join("/");
}

function assertZipEntryLimits(entry, totals) {
  if (entry.originalSize > MAX_DOCUMENT_BYTES) throw new Error(`ZIP中的“${safeName(entry.name)}”解压后超过20MB。`);
  if (entry.originalSize > 1024 * 1024 && (!entry.size || entry.originalSize / entry.size > 200)) {
    throw new Error(`ZIP中的“${safeName(entry.name)}”压缩比异常，已拒绝导入。`);
  }
  totals.expanded += entry.originalSize;
  totals.files += 1;
  if (totals.files > MAX_ARCHIVE_DOCUMENTS) throw new Error("一个ZIP最多包含60个可导入文档。");
  if (totals.expanded > MAX_ARCHIVE_EXPANDED_BYTES) throw new Error("ZIP解压后的文档总量不能超过80MB。");
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'").replace(/&amp;/gu, "&");
}

function textFromXml(xml) {
  return [...String(xml || "").matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gu)]
    .map((match) => decodeXml(match[1]).replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function unzipOfficeXml(bytes, wanted, label) {
  const totals = { expanded: 0, files: 0 };
  try {
    return unzipSync(bytes, {
      filter(entry) {
        if (!wanted.test(entry.name)) return false;
        assertZipEntryLimits(entry, totals);
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && /超过|异常|拒绝/u.test(error.message)) throw error;
    throw new Error(`${label}无法安全解压，请确认文件未损坏且未加密。`);
  }
}

function extractDocx(bytes) {
  const entries = unzipOfficeXml(bytes, /^word\/(?:document|footnotes|endnotes)\.xml$/u, "Word文档");
  const text = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"]
    .filter((name) => entries[name])
    .map((name) => textFromXml(decoder.decode(entries[name])))
    .filter(Boolean)
    .join("\n\n");
  if (!text) throw new Error("Word文档中没有识别到可编辑文字；扫描图片请先做OCR并校对。");
  return text;
}

function extractPptx(bytes) {
  let index;
  try {
    index = indexZipEntries(bytes);
  } catch {
    throw new Error("PPTX结构不完整或已损坏。");
  }
  const slides = [...index.entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name))
    .sort((left, right) => Number(left.match(/slide(\d+)\.xml$/u)?.[1]) - Number(right.match(/slide(\d+)\.xml$/u)?.[1]));
  if (!slides.length) throw new Error("PPTX中没有找到幻灯片。");
  if (slides.length > 180) throw new Error("单个PPTX最多导入180页。");
  let expanded = 0;
  const pages = [];
  for (const [position, name] of slides.entries()) {
    const info = index.entries.get(name);
    if (!info || info.uncompressedSize > 2 * 1024 * 1024) throw new Error(`PPTX第${position + 1}页的文本结构异常。`);
    expanded += info.uncompressedSize;
    if (expanded > 20 * 1024 * 1024) throw new Error("PPTX可提取文本结构超过20MB。");
    const content = readZipEntry(index, name);
    const text = content ? textFromXml(decoder.decode(content)) : "";
    if (text) pages.push(`第${position + 1}页\n${text}`);
  }
  const result = pages.join("\n\n");
  if (!result) throw new Error("PPTX中没有识别到可编辑文字；图片型页面请先补充说明文字。");
  return result;
}

function extractPlainText(bytes) {
  const text = decoder.decode(bytes).replace(/\u0000/gu, "").trim();
  if (!text) throw new Error("文本文件为空或无法按UTF-8读取。");
  return text;
}

function extractDocument(bytes, name) {
  if (bytes.length <= 0) throw new Error(`“${safeName(name)}”为空文件。`);
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error(`“${safeName(name)}”超过20MB。`);
  const ext = extension(name);
  if (ext === ".txt" || ext === ".md") return extractPlainText(bytes);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(`“${safeName(name)}”不是有效的Office文档。`);
  if (ext === ".docx") return extractDocx(bytes);
  if (ext === ".pptx") return extractPptx(bytes);
  throw new Error(`暂不支持“${safeName(name)}”的文件类型。`);
}

function extractPackage(bytes, originalName) {
  const ext = extension(originalName);
  if (ext !== ".zip") return [{ name: safeName(originalName), text: extractDocument(bytes, originalName) }];
  const totals = { expanded: 0, files: 0 };
  const accepted = [];
  let entries;
  try {
    entries = unzipSync(bytes, {
      filter(entry) {
        const name = safeArchiveName(entry.name);
        if (!name || name.endsWith("/") || name.startsWith("__MACOSX/") || /\/(?:\.|~\$)/u.test(`/${name}`)) return false;
        const extname = extension(name);
        if (extname === ".zip") throw new Error("ZIP中不能再包含嵌套ZIP文件。");
        if (BLOCKED_EXTENSIONS.has(extname)) throw new Error(`ZIP中包含不允许的可执行或脚本文件：“${safeName(name)}”。`);
        if (!ALLOWED_EXTENSIONS.has(extname)) return false;
        assertZipEntryLimits(entry, totals);
        accepted.push(name);
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && /ZIP|超过|异常|拒绝|不允许/u.test(error.message)) throw error;
    throw new Error("ZIP无法安全解压，请确认压缩包未损坏且没有密码。");
  }
  if (!accepted.length) throw new Error("ZIP中没有可导入的TXT、Markdown、Word或PPTX文档。");
  return accepted.map((name) => ({ name, text: extractDocument(entries[name], name) }));
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").replace(/\r\n?/gu, "\n").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function splitText(value) {
  const text = normalizeText(value);
  const chunks = [];
  const target = 900;
  const overlap = 120;
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + target);
    if (end < text.length) {
      const candidate = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf("。", end), text.lastIndexOf(". ", end));
      if (candidate > start + 520) end = candidate + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length >= 30) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function contentDisposition(fileName) {
  const encoded = encodeURIComponent(fileName).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="knowledge-source"; filename*=UTF-8''${encoded}`;
}

function sourceDto(row) {
  return {
    id: String(row.id),
    originalName: String(row.original_name),
    displayName: String(row.display_name),
    size: Number(row.size),
    documentCount: Number(row.document_count),
    chunkCount: Number(row.chunk_count),
    extractedCharacters: Number(row.extracted_characters),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listKnowledgeSources() {
  await ensureSchema();
  const result = await runtimeDb().prepare(
    "SELECT id,original_name,display_name,size,document_count,chunk_count,extracted_characters,status,created_at,updated_at FROM knowledge_sources ORDER BY updated_at DESC LIMIT 100",
  ).all();
  return (result.results || []).map(sourceDto);
}

export async function knowledgeStats() {
  await ensureSchema();
  const row = await runtimeDb().prepare(
    "SELECT COUNT(*) AS source_count,COALESCE(SUM(chunk_count),0) AS chunk_count,COALESCE(SUM(document_count),0) AS document_count FROM knowledge_sources WHERE status='ready'",
  ).first();
  return { sourceCount: Number(row?.source_count || 0), chunkCount: Number(row?.chunk_count || 0), documentCount: Number(row?.document_count || 0) };
}

export async function importKnowledgePackage({ bytes, originalName, displayName, actorUserId, actorName }) {
  await ensureSchema();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!data.length) throw new Error("请选择要导入的知识库文件。");
  if (data.length > MAX_KNOWLEDGE_UPLOAD_BYTES) throw new Error("知识库文件不能超过25MB。");
  const original = safeName(originalName, "课程资料");
  const ext = extension(original);
  if (![...ALLOWED_EXTENSIONS, ".zip"].includes(ext)) throw new Error("仅支持.txt、.md、.docx、.pptx或.zip文件。");
  const hash = await digestHex(data);
  const duplicate = await runtimeDb().prepare(
    "SELECT id,original_name,display_name,size,document_count,chunk_count,extracted_characters,status,created_at,updated_at FROM knowledge_sources WHERE content_hash=? LIMIT 1",
  ).bind(hash).first();
  if (duplicate) {
    if (String(duplicate.status) !== "ready") {
      const now = new Date().toISOString();
      await runtimeDb().prepare("UPDATE knowledge_sources SET status='ready',updated_at=? WHERE id=?").bind(now, String(duplicate.id)).run();
      duplicate.status = "ready";
      duplicate.updated_at = now;
      clearCache();
    }
    return { source: sourceDto(duplicate), duplicate: true };
  }

  const documents = extractPackage(data, original).map((document) => ({ ...document, text: normalizeText(document.text) }));
  const extractedCharacters = documents.reduce((sum, document) => sum + document.text.length, 0);
  if (extractedCharacters < 30) throw new Error("资料中可识别文字过少，不能建立知识索引。");
  if (extractedCharacters > MAX_EXTRACTED_CHARACTERS) throw new Error("本次资料可识别文字超过65万字，请拆成多个资料包导入。");
  const shownName = safeName(displayName, original);
  const chunks = [];
  for (const document of documents) {
    const citation = documents.length === 1 ? `教师资料：${shownName}` : `教师资料：${shownName} / ${safeName(document.name)}`;
    for (const content of splitText(document.text)) {
      chunks.push({ content, citation, searchText: `${shownName}\n${document.name}\n${content}` });
      if (chunks.length > MAX_CHUNKS) throw new Error("本次资料分块超过1200条，请拆分后再导入。");
    }
  }
  if (!chunks.length) throw new Error("资料中没有足够长的可检索段落。");

  const sourceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const objectKey = `knowledge/sources/${sourceId}/${original}`;
  await runtimeBucket().put(objectKey, data, {
    httpMetadata: { contentType: "application/octet-stream", contentDisposition: contentDisposition(original) },
    customMetadata: { sourceId, contentHash: hash, originalName: original },
  });
  try {
    const statements = [
      runtimeDb().prepare(
        "INSERT INTO knowledge_sources (id,original_name,display_name,object_key,size,content_hash,status,document_count,chunk_count,extracted_characters,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'ready',?,?,?,?,?,?)",
      ).bind(sourceId, original, shownName, objectKey, data.length, hash, documents.length, chunks.length, extractedCharacters, actorUserId, now, now),
      ...chunks.map((chunk, index) => runtimeDb().prepare(
        "INSERT INTO knowledge_source_chunks (id,source_id,chunk_index,content,search_text,citation,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), sourceId, index, chunk.content, chunk.searchText, chunk.citation, now)),
      runtimeDb().prepare(
        "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), actorUserId, "import_knowledge", "knowledge_source", sourceId, `${actorName || "课程教师"}导入${documents.length}个文档、${chunks.length}个知识块`, now),
    ];
    await runtimeDb().batch(statements);
  } catch (error) {
    await runtimeBucket().delete(objectKey).catch(() => undefined);
    throw error;
  }
  clearCache();
  return {
    source: { id: sourceId, originalName: original, displayName: shownName, size: data.length, documentCount: documents.length, chunkCount: chunks.length, extractedCharacters, status: "ready", createdAt: now, updatedAt: now },
    duplicate: false,
  };
}

export async function setKnowledgeSourceActive({ sourceId, active, actorUserId }) {
  await ensureSchema();
  const existing = await runtimeDb().prepare("SELECT id FROM knowledge_sources WHERE id=? LIMIT 1").bind(sourceId).first();
  if (!existing) throw new Error("没有找到指定的知识库资料。");
  const status = active ? "ready" : "paused";
  const now = new Date().toISOString();
  await runtimeDb().batch([
    runtimeDb().prepare("UPDATE knowledge_sources SET status=?,updated_at=? WHERE id=?").bind(status, now, sourceId),
    runtimeDb().prepare(
      "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), actorUserId, active ? "enable_knowledge" : "pause_knowledge", "knowledge_source", sourceId, active ? "启用教师知识库资料" : "停用教师知识库资料", now),
  ]);
  clearCache();
  return listKnowledgeSources();
}

export async function listActiveKnowledgeChunks() {
  const state = cache();
  if (state.value) return state.value;
  state.pending ||= (async () => {
    await ensureSchema();
    const result = await runtimeDb().prepare(
      "SELECT knowledge_source_chunks.id,knowledge_source_chunks.content,knowledge_source_chunks.search_text,knowledge_source_chunks.citation FROM knowledge_source_chunks JOIN knowledge_sources ON knowledge_sources.id=knowledge_source_chunks.source_id WHERE knowledge_sources.status='ready' ORDER BY knowledge_sources.updated_at DESC,knowledge_source_chunks.chunk_index LIMIT 5000",
    ).all();
    const chunks = (result.results || []).map((row) => ({
      chunk_id: `teacher-${String(row.id)}`,
      content: String(row.content),
      search_text: String(row.search_text),
      citation: String(row.citation),
      attributes: { source_type: "teacher_upload", authority_rank: 720 },
    }));
    state.value = Object.freeze(chunks.map((chunk) => Object.freeze(chunk)));
    return state.value;
  })().catch((error) => {
    state.pending = null;
    throw error;
  });
  return state.pending;
}

export const knowledgeStoreInternalsForTests = { extension, safeArchiveName, splitText, extractPackage };
