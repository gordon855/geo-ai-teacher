import "server-only";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Step4Error } from "./errors.mjs";

const CONFIG_SYMBOL = Symbol.for("surveying-ai-teacher.step4.config-cache");

function globalConfigCache() {
  if (!globalThis[CONFIG_SYMBOL]) globalThis[CONFIG_SYMBOL] = new Map();
  return globalThis[CONFIG_SYMBOL];
}

export function resolveProjectRoot() {
  const configured = String(process.env.SURVEYING_AI_TEACHER_ROOT || "").trim();
  const candidate = path.resolve(configured || process.cwd());
  if (!fs.existsSync(path.join(candidate, "config", "chat.config.json"))) {
    throw new Step4Error("CONFIG_NOT_FOUND", "没有找到第4步配置文件。", {
      httpStatus: 503,
      publicMessage: "问答服务尚未完成配置。",
    });
  }
  return candidate;
}

export function loadChatConfig(projectRoot = resolveProjectRoot()) {
  const configPath = path.join(projectRoot, "config", "chat.config.json");
  const cache = globalConfigCache();
  if (cache.has(configPath)) return cache.get(configPath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Step4Error("CONFIG_INVALID", "第4步配置文件无法读取。", {
      cause: error,
      httpStatus: 503,
      publicMessage: "问答服务配置需要检查。",
    });
  }
  if (parsed.schema_version !== 1 || !parsed.package_version) {
    throw new Step4Error("CONFIG_INVALID", "第4步配置版本不受支持。", {
      httpStatus: 503,
      publicMessage: "问答服务配置需要更新。",
    });
  }
  cache.set(configPath, parsed);
  return parsed;
}

function trimBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/u, "");
}

function isPlaceholder(value) {
  return !value || value.length < 20 || /请|your|replace|填写|example/i.test(value);
}

export function resolveBailianSettings(config = loadChatConfig(), { requireKey = true } = {}) {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || "").trim();
  if (requireKey && isPlaceholder(apiKey)) {
    throw new Step4Error("PROVIDER_KEY_MISSING", "DASHSCOPE_API_KEY没有配置。", {
      httpStatus: 503,
      publicMessage: "问答服务的百炼密钥尚未配置。",
    });
  }

  const workspaceId = String(process.env.BAILIAN_WORKSPACE_ID || "").trim();
  let compatibleBaseUrl = trimBaseUrl(process.env.BAILIAN_BASE_URL);
  if (!compatibleBaseUrl && workspaceId) {
    compatibleBaseUrl = `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`;
  }
  if (!compatibleBaseUrl) {
    throw new Step4Error("PROVIDER_ENDPOINT_MISSING", "缺少北京地域业务空间ID。", {
      httpStatus: 503,
      publicMessage: "问答服务的百炼业务空间尚未配置。",
    });
  }

  let parsed;
  try {
    parsed = new URL(compatibleBaseUrl);
  } catch (error) {
    throw new Step4Error("PROVIDER_ENDPOINT_INVALID", "BAILIAN_BASE_URL不是有效网址。", {
      cause: error,
      httpStatus: 503,
      publicMessage: "问答服务的接口地址需要检查。",
    });
  }

  const allowMock = process.env.STEP4_ALLOW_MOCK_ENDPOINT === "1";
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  const beijing =
    parsed.protocol === "https:" &&
    (parsed.hostname === "dashscope.aliyuncs.com" ||
      parsed.hostname.endsWith(".cn-beijing.maas.aliyuncs.com"));
  if (!beijing && !(allowMock && loopback && parsed.protocol === "http:")) {
    throw new Step4Error("PROVIDER_REGION_INVALID", "接口不是百炼华北2（北京）地域。", {
      httpStatus: 503,
      publicMessage: "问答服务的百炼地域配置不正确。",
    });
  }
  if (!parsed.pathname.endsWith("/compatible-mode/v1")) {
    throw new Step4Error("PROVIDER_ENDPOINT_INVALID", "兼容接口路径不正确。", {
      httpStatus: 503,
      publicMessage: "问答服务的接口地址需要检查。",
    });
  }

  const hostBase = `${parsed.protocol}//${parsed.host}`;
  const embeddingModel = String(
    process.env.KB_EMBEDDING_MODEL || config.index.embedding_model,
  ).trim();
  const dimensions = Number(
    process.env.KB_EMBEDDING_DIMENSIONS || config.index.dimensions,
  );
  const chatModel = String(process.env.KB_CHAT_MODEL || config.generation.model).trim();
  if (embeddingModel !== config.index.embedding_model || dimensions !== config.index.dimensions) {
    throw new Step4Error("INDEX_MODEL_MISMATCH", "环境变量中的向量模型与本地索引不一致。", {
      httpStatus: 503,
      publicMessage: "问答服务的向量模型配置与知识库不一致。",
    });
  }

  return {
    apiKey,
    workspaceId,
    compatibleBaseUrl,
    nativeBaseUrl: `${hostBase}/api/v1`,
    embeddingModel,
    dimensions,
    chatModel,
  };
}
