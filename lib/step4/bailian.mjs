import "server-only";

import { Step4Error } from "./errors.mjs";

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function providerError(status, data, cause) {
  const providerCode = String(data?.error?.code || data?.code || data?.Code || "");
  if (status === 401 || status === 403 || /AccessDenied|InvalidApiKey|Unauthorized/i.test(providerCode)) {
    return new Step4Error("PROVIDER_ACCESS_DENIED", "百炼拒绝了模型访问。", {
      cause,
      httpStatus: 503,
      publicMessage: "问答服务的百炼密钥、业务空间或模型权限需要检查。",
    });
  }
  if (status === 429) {
    return new Step4Error("PROVIDER_RATE_LIMITED", "百炼模型限流。", {
      cause,
      httpStatus: 503,
      retryAfter: 3,
      publicMessage: "课程问答当前较忙，请稍后重试。",
    });
  }
  if (status >= 500) {
    return new Step4Error("PROVIDER_UNAVAILABLE", "百炼服务暂时不可用。", {
      cause,
      httpStatus: 503,
      retryAfter: 3,
      publicMessage: "课程问答服务暂时不可用，请稍后重试。",
    });
  }
  return new Step4Error("PROVIDER_REQUEST_FAILED", "百炼请求未通过。", {
    cause,
    httpStatus: 502,
    publicMessage: "课程问答请求未完成，请稍后重试。",
  });
}

async function postJson(url, apiKey, body, options) {
  const attempts = Math.max(1, Number(options.maxAttempts || 1));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    const forwardAbort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", forwardAbort, { once: true });
    try {
      const response = await options.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!response.ok) {
        if (attempt < attempts && isRetryableStatus(response.status)) {
          await sleep(350 * attempt);
          continue;
        }
        throw providerError(response.status, data);
      }
      return data;
    } catch (error) {
      if (error instanceof Step4Error) throw error;
      const timedOut = controller.signal.aborted;
      if (!timedOut && attempt < attempts) {
        await sleep(350 * attempt);
        continue;
      }
      throw new Step4Error(timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR", "百炼网络请求失败。", {
        cause: error,
        httpStatus: timedOut ? 504 : 503,
        retryAfter: 3,
        publicMessage: timedOut
          ? "课程问答响应超时，请稍后重试。"
          : "课程问答服务暂时无法连接，请稍后重试。",
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  }
  throw new Step4Error("PROVIDER_REQUEST_FAILED", "百炼请求未完成。", { httpStatus: 502 });
}

function validateVector(vector, dimensions) {
  if (!Array.isArray(vector) || vector.length !== dimensions) {
    throw new Step4Error("PROVIDER_RESPONSE_INVALID", "百炼返回的查询向量维度不正确。", {
      httpStatus: 502,
      publicMessage: "课程知识检索暂时不可用。",
    });
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Step4Error("PROVIDER_RESPONSE_INVALID", "百炼返回了异常查询向量。", {
      httpStatus: 502,
      publicMessage: "课程知识检索暂时不可用。",
    });
  }
}

export function createBailianClient(settings, config, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const requestOptions = {
    fetchImpl,
    timeoutMs: config.protection.upstream_timeout_ms,
    maxAttempts: config.protection.upstream_max_attempts,
  };
  return {
    async embedQuery(question, signal) {
      const url = `${settings.nativeBaseUrl}/services/embeddings/text-embedding/text-embedding`;
      const data = await postJson(
        url,
        settings.apiKey,
        {
          model: settings.embeddingModel,
          input: { texts: [question] },
          parameters: {
            dimension: settings.dimensions,
            output_type: "dense",
            text_type: "query",
            instruct: config.retrieval.query_instruct,
          },
        },
        { ...requestOptions, signal },
      );
      const item = data?.output?.embeddings?.[0];
      validateVector(item?.embedding, settings.dimensions);
      return item.embedding;
    },

    async generateJson(messages, signal, generationOptions = {}) {
      const url = `${settings.compatibleBaseUrl}/chat/completions`;
      const data = await postJson(
        url,
        settings.apiKey,
        {
          model: settings.chatModel,
          messages,
          temperature: generationOptions.temperature ?? config.generation.temperature,
          max_tokens: generationOptions.maxTokens ?? config.generation.max_tokens,
          stream: false,
          enable_search: false,
          response_format: { type: "json_object" },
        },
        { ...requestOptions, signal },
      );
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Step4Error("PROVIDER_RESPONSE_INVALID", "百炼没有返回回答文本。", {
          httpStatus: 502,
          publicMessage: "课程问答没有生成有效回答，请重试。",
        });
      }
      return content;
    },
  };
}
