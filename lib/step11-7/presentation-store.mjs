import "server-only";

import { ensureSchema } from "../step8a/database";
import { analyzePresentationDeck } from "../step14/presentation-analysis.mjs";
import { indexZipEntries } from "../step11-9/pptx-slide-text.mjs";

export const MAX_PRESENTATION_BYTES = 80 * 1024 * 1024;

function runtime() {
  return globalThis.__SURVEYING_RUNTIME_ENV__ || {};
}

function db() {
  if (!runtime().DB) throw new Error("公网PPT数据库尚未连接。");
  return runtime().DB;
}

function bucket() {
  if (!runtime().BUCKET) throw new Error("公网PPT文件存储尚未连接。");
  return runtime().BUCKET;
}

function containsAscii(bytes, text) {
  const marker = new TextEncoder().encode(text);
  outer: for (let index = 0; index <= bytes.length - marker.length; index += 1) {
    for (let offset = 0; offset < marker.length; offset += 1) {
      if (bytes[index + offset] !== marker[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function validatePptx(bytes, originalName) {
  if (!/\.pptx$/iu.test(originalName)) throw new Error("只支持上传.pptx格式的PowerPoint文件。");
  if (!bytes.length) throw new Error("PPT文件为空，请重新选择。");
  if (bytes.length > MAX_PRESENTATION_BYTES) throw new Error("PPT文件不能超过80MB。");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("该文件不是有效的PPTX文件。");
  if (!containsAscii(bytes, "ppt/presentation.xml")) throw new Error("PPTX文件结构不完整，无法找到演示文稿内容。");
  const { entries } = indexZipEntries(bytes);
  let expanded = 0;
  for (const entry of entries.values()) {
    expanded += entry.uncompressedSize;
    if (entry.uncompressedSize > 80 * 1024 * 1024 || expanded > 512 * 1024 * 1024 || entries.size > 20000) {
      throw new Error("课件解压后的内容过大，请拆分课件或压缩媒体后上传。");
    }
  }
}

function safeName(value) {
  const withoutPath = String(value || "课堂演示.pptx").split(/[\\/]/u).at(-1) || "课堂演示.pptx";
  return withoutPath.replace(/[<>:"|?*\u0000-\u001f]/gu, "_").slice(0, 180);
}

function contentDisposition(disposition, fileName, asciiFallback) {
  const encoded = encodeURIComponent(fileName).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function dto(row) {
  return {
    originalName: String(row.original_name),
    fileName: String(row.object_key).split("/").at(-1),
    objectKey: String(row.object_key),
    size: Number(row.size),
    version: String(row.version),
    updatedAt: String(row.updated_at),
    updatedBy: String(row.updated_by),
    analysis: analysisSummary(row.slide_text_json),
  };
}

function parseAnalysis(value) {
  try {
    const parsed = JSON.parse(String(value || "null"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function analysisSummary(value) {
  const analysis = parseAnalysis(value);
  return analysis ? {
    slideCount: Number(analysis.slideCount || 0),
    underlineCount: Number(analysis.underlineCount || 0),
    termCount: Number(analysis.termCount || 0),
    analyzedAt: String(analysis.analyzedAt || ""),
  } : null;
}

export async function readPresentationMetadata() {
  await ensureSchema();
  const row = await db().prepare(
    "SELECT original_name,object_key,size,version,slide_text_json,updated_at,updated_by FROM presentations WHERE is_current=1 ORDER BY updated_at DESC LIMIT 1",
  ).first();
  if (!row) return null;
  const object = await bucket().head(String(row.object_key));
  if (!object || Number(object.size) !== Number(row.size)) return null;
  return dto(row);
}

export async function listPresentationCatalog() {
  await ensureSchema();
  const result = await db().prepare(
    "SELECT original_name,object_key,size,version,slide_text_json,updated_at,updated_by,is_current FROM presentations ORDER BY updated_at DESC",
  ).all();
  return (result.results || []).map((row) => ({ ...dto(row), isCurrent: Number(row.is_current) === 1 }));
}

export async function readPresentationAnalysis(version) {
  await ensureSchema();
  const row = await db().prepare(
    "SELECT original_name,object_key,size,version,slide_text_json,updated_at,updated_by,is_current FROM presentations WHERE version=? LIMIT 1",
  ).bind(String(version || "")).first();
  if (!row) return null;
  return { presentation: { ...dto(row), isCurrent: Number(row.is_current) === 1 }, analysis: parseAnalysis(row.slide_text_json) };
}

export async function savePresentation({ bytes, originalName, updatedBy, activate = false }) {
  await ensureSchema();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const displayName = safeName(originalName);
  validatePptx(data, displayName);
  const analysis = analyzePresentationDeck(data);
  const hash = await digestHex(data);
  const version = hash.slice(0, 16);
  const existing = await readPresentationAnalysis(version);
  if (existing && !activate && await bucket().head(existing.presentation.objectKey)) {
    return { ...existing.presentation, duplicate: true };
  }
  const objectKey = `presentations/deck-${version}.pptx`;
  await bucket().put(objectKey, data, {
    httpMetadata: {
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      contentDisposition: contentDisposition("inline", displayName, "course-presentation.pptx"),
    },
    customMetadata: { version, originalName: displayName },
  });
  const now = new Date().toISOString();
  await db().batch([
    ...(activate ? [db().prepare("UPDATE presentations SET is_current=0 WHERE is_current=1")] : []),
    db().prepare(
      "INSERT INTO presentations (id,original_name,object_key,size,version,slide_text_json,updated_by,updated_at,is_current) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(version) DO UPDATE SET original_name=excluded.original_name,object_key=excluded.object_key,size=excluded.size,slide_text_json=excluded.slide_text_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at,is_current=" + (activate ? "1" : "presentations.is_current"),
    ).bind(crypto.randomUUID(), displayName, objectKey, data.length, version, JSON.stringify(analysis), String(updatedBy || "课程教师").slice(0, 80), now, activate ? 1 : 0),
  ]);
  return {
    originalName: displayName,
    fileName: `deck-${version}.pptx`,
    objectKey,
    size: data.length,
    version,
    updatedAt: now,
    updatedBy: String(updatedBy || "课程教师").slice(0, 80),
    analysis: analysisSummary(JSON.stringify(analysis)),
  };
}

// Keep the legacy upload-and-publish API compatible. The new catalog saves first.
export async function replacePresentation(input) {
  return savePresentation({ ...input, activate: true });
}

export async function selectPresentation(version) {
  if (!/^[a-f0-9]{16}$/u.test(String(version))) throw new Error("课件编号无效。");
  const record = await readPresentationAnalysis(version);
  if (!record) throw new Error("课件不存在，请刷新课件库。");
  const object = await bucket().head(record.presentation.objectKey);
  if (!object || Number(object.size) !== record.presentation.size) throw new Error("课件文件缺失，请重新上传这份课件。");
  await db().batch([
    db().prepare("UPDATE presentations SET is_current=0 WHERE is_current=1"),
    db().prepare("UPDATE presentations SET is_current=1 WHERE version=?").bind(version),
  ]);
  return record.presentation;
}

export async function readCurrentPresentation() {
  const metadata = await readPresentationMetadata();
  if (!metadata) return null;
  const object = await bucket().get(metadata.objectKey);
  if (!object) return null;
  return { metadata, bytes: new Uint8Array(await object.arrayBuffer()) };
}

export async function readPresentationByVersion(version) {
  const record = await readPresentationAnalysis(version);
  if (!record) return null;
  const object = await bucket().get(record.presentation.objectKey);
  if (!object) return null;
  return { metadata: record.presentation, analysis: record.analysis, bytes: new Uint8Array(await object.arrayBuffer()) };
}
