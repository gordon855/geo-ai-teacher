import "server-only";

import crypto from "node:crypto";
import { Step4Error } from "./errors.mjs";

const GUARD_SYMBOL = Symbol.for("surveying-ai-teacher.step4.guard-state");

function guardState() {
  if (!globalThis[GUARD_SYMBOL]) {
    globalThis[GUARD_SYMBOL] = {
      active: 0,
      queue: [],
      rate: new Map(),
    };
  }
  return globalThis[GUARD_SYMBOL];
}

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

export function assertAllowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = firstHeaderValue(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto")) || new URL(request.url).protocol.replace(":", "");
  const sameOrigin = host ? `${protocol}://${host}` : new URL(request.url).origin;
  const allowed = new Set(
    String(process.env.CHAT_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim().replace(/\/$/u, ""))
      .filter(Boolean),
  );
  if (origin.replace(/\/$/u, "") !== sameOrigin.replace(/\/$/u, "") && !allowed.has(origin.replace(/\/$/u, ""))) {
    throw new Step4Error("ORIGIN_FORBIDDEN", "跨站请求已拒绝。", {
      httpStatus: 403,
      publicMessage: "该请求来源不受允许。",
    });
  }
}

function clientFingerprint(request) {
  const address = firstHeaderValue(
    request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local",
  );
  return crypto.createHash("sha256").update(address).digest("hex").slice(0, 20);
}

export function enforceRateLimit(request, config) {
  const state = guardState();
  const now = Date.now();
  const windowMs = Number(config.protection.rate_limit_window_ms);
  const maximum = Number(config.protection.rate_limit_requests);
  const key = clientFingerprint(request);
  const current = state.rate.get(key);
  if (!current || now >= current.resetAt) {
    state.rate.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    current.count += 1;
    if (current.count > maximum) {
      const seconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      throw new Step4Error("RATE_LIMITED", "客户端请求过于频繁。", {
        httpStatus: 429,
        retryAfter: seconds,
        publicMessage: "提问过于频繁，请稍后再试。",
      });
    }
  }
  if (state.rate.size > 1000) {
    for (const [entryKey, entry] of state.rate) {
      if (now >= entry.resetAt) state.rate.delete(entryKey);
    }
  }
}

function releaseOne(config) {
  const state = guardState();
  state.active = Math.max(0, state.active - 1);
  while (state.queue.length > 0 && state.active < config.protection.concurrency) {
    const queued = state.queue.shift();
    if (queued.done) continue;
    queued.done = true;
    clearTimeout(queued.timer);
    state.active += 1;
    queued.resolve(() => releaseOne(config));
  }
}

export async function acquireQuestionSlot(config) {
  const state = guardState();
  if (state.active < config.protection.concurrency) {
    state.active += 1;
    return () => releaseOne(config);
  }
  if (state.queue.length >= config.protection.max_queue_length) {
    throw new Step4Error("QUEUE_FULL", "单路问答队列已满。", {
      httpStatus: 429,
      retryAfter: 3,
      publicMessage: "当前已有其他同学正在提问，请稍后重试。",
    });
  }
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject, timer: null, done: false };
    entry.timer = setTimeout(() => {
      if (entry.done) return;
      entry.done = true;
      const position = state.queue.indexOf(entry);
      if (position >= 0) state.queue.splice(position, 1);
      reject(new Step4Error("QUEUE_TIMEOUT", "等待单路问答超时。", {
        httpStatus: 429,
        retryAfter: 3,
        publicMessage: "当前已有其他同学正在提问，请稍后重试。",
      }));
    }, config.protection.queue_timeout_ms);
    state.queue.push(entry);
  });
}

export function resetGuardStateForTests() {
  const state = guardState();
  for (const item of state.queue) clearTimeout(item.timer);
  state.active = 0;
  state.queue = [];
  state.rate.clear();
}
