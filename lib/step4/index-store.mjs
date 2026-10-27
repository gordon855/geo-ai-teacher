import "server-only";

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { loadChatConfig, resolveProjectRoot } from "./config.mjs";
import { Step4Error } from "./errors.mjs";

const INDEX_SYMBOL = Symbol.for("surveying-ai-teacher.step4.index-cache");

function indexCache() {
  if (!globalThis[INDEX_SYMBOL]) globalThis[INDEX_SYMBOL] = new Map();
  return globalThis[INDEX_SYMBOL];
}

async function sha256File(filePath) {
  const data = await fsp.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function vectorNorm(vectors, row, dimensions) {
  const start = row * dimensions * 4;
  let sum = 0;
  for (let dimension = 0; dimension < dimensions; dimension += 1) {
    const value = vectors.readFloatLE(start + dimension * 4);
    if (!Number.isFinite(value)) return Number.NaN;
    sum += value * value;
  }
  return Math.sqrt(sum);
}

async function loadAndVerify(projectRoot) {
  const config = loadChatConfig(projectRoot);
  const directory = path.join(projectRoot, "data", "knowledge-base");
  const metaPath = path.join(directory, "knowledge-index.meta.json");
  const chunksPath = path.join(directory, "knowledge-chunks.jsonl");
  const vectorsPath = path.join(directory, "knowledge-vectors.f32");

  let meta;
  let chunkText;
  let vectors;
  try {
    [meta, chunkText, vectors] = await Promise.all([
      fsp.readFile(metaPath, "utf8").then(JSON.parse),
      fsp.readFile(chunksPath, "utf8"),
      fsp.readFile(vectorsPath),
    ]);
  } catch (error) {
    throw new Step4Error("INDEX_NOT_READY", "本地知识索引文件缺失或损坏。", {
      cause: error,
      httpStatus: 503,
      publicMessage: "课程知识库尚未准备好。",
    });
  }

  const errors = [];
  if (meta.provider !== config.index.provider) errors.push("provider");
  if (meta.region !== config.index.region) errors.push("region");
  if (meta.embedding_model !== config.index.embedding_model) errors.push("embedding_model");
  if (meta.dimensions !== config.index.dimensions) errors.push("dimensions");
  if (meta.chunk_count !== config.index.expected_chunks) errors.push("chunk_count");

  const chunks = [];
  const seen = new Set();
  for (const [lineNumber, line] of chunkText.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      const chunk = JSON.parse(line);
      if (!chunk.chunk_id || seen.has(chunk.chunk_id)) errors.push(`chunk_id:${lineNumber + 1}`);
      if (chunk.index !== chunks.length) errors.push(`row:${lineNumber + 1}`);
      if (!chunk.content || !chunk.citation || !chunk.search_text) errors.push(`content:${lineNumber + 1}`);
      for (const excluded of config.index.excluded_page_ids) {
        if (String(chunk.chunk_id).startsWith(excluded)) errors.push(`excluded:${excluded}`);
      }
      seen.add(chunk.chunk_id);
      chunks.push(chunk);
    } catch {
      errors.push(`json:${lineNumber + 1}`);
    }
  }
  if (chunks.length !== config.index.expected_chunks) errors.push("chunks_length");
  const expectedBytes = chunks.length * meta.dimensions * 4;
  if (vectors.length !== expectedBytes) errors.push("vector_bytes");

  if (errors.length === 0) {
    const [chunksHash, vectorsHash] = await Promise.all([
      sha256File(chunksPath),
      sha256File(vectorsPath),
    ]);
    if (chunksHash !== meta.chunks_sha256) errors.push("chunks_sha256");
    if (vectorsHash !== meta.vectors_sha256) errors.push("vectors_sha256");
  }

  if (errors.length === 0) {
    for (let row = 0; row < chunks.length; row += 1) {
      const norm = vectorNorm(vectors, row, meta.dimensions);
      if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.002) {
        errors.push(`vector_norm:${row}`);
        break;
      }
    }
  }

  if (errors.length > 0) {
    throw new Step4Error("INDEX_INTEGRITY_FAILED", `本地索引完整性检查失败：${errors.join(",")}`, {
      httpStatus: 503,
      publicMessage: "课程知识库完整性检查未通过。",
    });
  }

  return Object.freeze({ meta, chunks, vectors, projectRoot, config });
}

export async function loadCourseIndex(projectRoot = resolveProjectRoot()) {
  const cache = indexCache();
  if (!cache.has(projectRoot)) {
    const pending = loadAndVerify(projectRoot).catch((error) => {
      cache.delete(projectRoot);
      throw error;
    });
    cache.set(projectRoot, pending);
  }
  return cache.get(projectRoot);
}

export function clearCourseIndexCacheForTests() {
  indexCache().clear();
}
