import "server-only";

import { NextResponse, type NextRequest } from "next/server";

export class ClassroomApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ClassroomApiError";
    this.status = status;
  }
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const configuredOrigin = process.env.CLASSROOM_PUBLIC_ORIGIN?.trim();
  const expectedOrigin = configuredOrigin || request.nextUrl.origin;
  if (origin !== expectedOrigin) {
    throw new ClassroomApiError(403, "请求来源校验失败。");
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ClassroomApiError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "服务器处理失败。";
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export function noStoreJson(payload: unknown, init?: ResponseInit) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

type LoginAttempt = { failures: number; blockedUntil: number };
const loginAttempts = new Map<string, LoginAttempt>();

export function assertLoginAllowed(key: string) {
  const attempt = loginAttempts.get(key);
  if (attempt && attempt.blockedUntil > Date.now()) {
    throw new ClassroomApiError(429, "登录失败次数过多，请15分钟后再试。");
  }
}

export function recordLoginFailure(key: string) {
  const existing = loginAttempts.get(key);
  const failures = (existing?.failures || 0) + 1;
  loginAttempts.set(key, {
    failures,
    blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
  });
}

export function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}

export function requestClientKey(request: NextRequest, username: string) {
  // Forwarded headers are trustworthy only behind an operator-controlled proxy.
  const forwarded = process.env.SECURITY_TRUST_PROXY === "1"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    : undefined;
  return (forwarded || "local") + ":" + username.toLowerCase();
}

