import "server-only";

import { inflateSync } from "fflate";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_SLIDE_CHARACTERS = 12_000;
const decoder = new TextDecoder();

function xmlDecode(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'").replace(/&amp;/gu, "&");
}

function normalizeSegment(value) {
  return xmlDecode(value).replace(/<[^>]+>/gu, "").replace(/\s+/gu, " ").trim();
}

function bytesView(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u16(view, offset) {
  return view.getUint16(offset, true);
}

function u32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
  const view = bytesView(bytes);
  const lowerBound = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
    if (u32(view, offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("PPTX压缩目录不完整，无法读取幻灯片。");
}

export function indexZipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22) throw new Error("PPTX文件过小，无法读取幻灯片。");
  const view = bytesView(bytes);
  const eocd = findEndOfCentralDirectory(bytes);
  const totalEntries = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  const entries = new Map();
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > bytes.length || u32(view, offset) !== CENTRAL_SIGNATURE) throw new Error("PPTX中央目录损坏，无法定位幻灯片。");
    const flags = u16(view, offset + 8);
    const compression = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)).replace(/\\/gu, "/");
    entries.set(name, { name, flags, compression, compressedSize, uncompressedSize, localOffset });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return { bytes, entries };
}

export function readZipEntry(index, name) {
  const entry = index.entries.get(name);
  if (!entry) return null;
  if ((entry.flags & 0x1) !== 0) throw new Error("PPTX包含加密内容，无法读取当前页。");
  const { bytes } = index;
  const view = bytesView(bytes);
  const offset = entry.localOffset;
  if (offset + 30 > bytes.length || u32(view, offset) !== LOCAL_SIGNATURE) throw new Error("PPTX幻灯片数据损坏。");
  const nameLength = u16(view, offset + 26);
  const extraLength = u16(view, offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new Error("PPTX幻灯片数据不完整。");
  const compressed = bytes.subarray(start, end);
  let content;
  if (entry.compression === 0) content = new Uint8Array(compressed);
  else if (entry.compression === 8) content = inflateSync(compressed);
  else throw new Error(`PPTX使用了暂不支持的压缩方式（${entry.compression}）。`);
  if (entry.uncompressedSize && content.length !== entry.uncompressedSize) throw new Error("PPTX幻灯片解压后的长度不一致。");
  return content;
}

function extractTextSegments(xml) {
  const segments = [];
  for (const match of String(xml || "").matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gu)) {
    const normalized = normalizeSegment(match[1]);
    if (normalized && segments.at(-1) !== normalized) segments.push(normalized);
  }
  return segments;
}

function extractRelatedTextSegments(xml) {
  const segments = [];
  for (const match of String(xml || "").matchAll(/<(?:[\w.-]+:)?(?:t|v)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?(?:t|v)>/gu)) {
    const normalized = normalizeSegment(match[1]);
    if (normalized && segments.at(-1) !== normalized) segments.push(normalized);
  }
  return segments;
}

function extractVisualDescriptions(xml) {
  const descriptions = [];
  for (const match of String(xml || "").matchAll(/<(?:[\w.-]+:)?cNvPr\b[^>]*\b(?:descr|title)="([^"]+)"[^>]*>/gu)) {
    const normalized = normalizeSegment(match[1]);
    if (normalized && !/^picture\s*\d*$/iu.test(normalized) && !descriptions.includes(normalized)) descriptions.push(normalized);
  }
  return descriptions.slice(0, 20);
}

function resolveZipTarget(base, target) {
  const parts = (target.startsWith("/") ? target.slice(1) : `${base}/${target}`).split("/");
  const resolved = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

function relationshipTargets(index, slideNumber) {
  const rels = readZipEntry(index, `ppt/slides/_rels/slide${slideNumber}.xml.rels`);
  if (!rels) return [];
  const targets = [];
  for (const match of decoder.decode(rels).matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*>/gu)) {
    const target = xmlDecode(match[1]);
    if (!/(?:charts|diagrams)\//iu.test(target)) continue;
    const resolved = resolveZipTarget("ppt/slides", target);
    if (!targets.includes(resolved)) targets.push(resolved);
  }
  return targets;
}

export function extractPptxSlide(bytes, slideNumber) {
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > 2_000) throw new Error("PPT页码不正确。");
  const index = indexZipEntries(bytes);
  const slideNames = [...index.entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name))
    .sort((left, right) => Number(left.match(/slide(\d+)\.xml$/u)?.[1]) - Number(right.match(/slide(\d+)\.xml$/u)?.[1]));
  const slideXml = readZipEntry(index, `ppt/slides/slide${slideNumber}.xml`);
  if (!slideXml) throw new Error(`当前PPT不存在第${slideNumber}页，请返回PPT重新选择。`);
  const xml = decoder.decode(slideXml);
  const segments = extractTextSegments(xml);
  const visualDescriptions = extractVisualDescriptions(xml);
  for (const target of relationshipTargets(index, slideNumber)) {
    const related = readZipEntry(index, target);
    if (!related) continue;
    for (const segment of extractRelatedTextSegments(decoder.decode(related))) if (!segments.includes(segment)) segments.push(segment);
  }
  const boundedSegments = [];
  let characters = 0;
  for (const segment of segments) {
    const available = MAX_SLIDE_CHARACTERS - characters;
    if (available <= 0) break;
    const next = segment.slice(0, available);
    if (next) boundedSegments.push(next);
    characters += next.length + 1;
  }
  const text = boundedSegments.join("\n").trim();
  if (!text && !visualDescriptions.length) throw new Error("这一页没有提取到可讲解的文字。若页面主要是图片，请先在PPT中为图片添加说明文字后重试。");
  return {
    number: slideNumber,
    count: slideNames.length,
    title: boundedSegments[0]?.slice(0, 180) || `第${slideNumber}页`,
    text,
    segments: boundedSegments,
    visualDescriptions,
    truncated: characters >= MAX_SLIDE_CHARACTERS,
  };
}
