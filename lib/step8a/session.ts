import "server-only";

import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import {
  createDatabaseSession,
  getUserBySessionToken,
  revokeDatabaseSession,
} from "./database";
import type { SafeUser, UserRole } from "./types";

export const CLASSROOM_SESSION_COOKIE = "surveying_class_session";

function cookieOptions(maxAgeSeconds: number, expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !(process.env.DEMO_MODE === "1" && ["http://localhost:3000", "http://127.0.0.1:3000"].includes(process.env.CLASSROOM_PUBLIC_ORIGIN || "")),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    expires,
    priority: "high" as const,
  };
}

export async function attachSessionCookie(response: NextResponse, userId: string, userAgent: string) {
  const session = await createDatabaseSession(userId, userAgent);
  response.cookies.set(
    CLASSROOM_SESSION_COOKIE,
    session.token,
    cookieOptions(session.maxAgeSeconds, session.expires),
  );
}

export async function clearSessionCookie(response: NextResponse, token: string | undefined) {
  await revokeDatabaseSession(token);
  response.cookies.set(CLASSROOM_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !(process.env.DEMO_MODE === "1" && ["http://localhost:3000", "http://127.0.0.1:3000"].includes(process.env.CLASSROOM_PUBLIC_ORIGIN || "")),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function currentRequestUser(request: NextRequest) {
  return getUserBySessionToken(request.cookies.get(CLASSROOM_SESSION_COOKIE)?.value);
}

export async function currentPageUser() {
  const token = (await cookies()).get(CLASSROOM_SESSION_COOKIE)?.value;
  return getUserBySessionToken(token);
}

export async function requireRequestRole(request: NextRequest, role: UserRole) {
  const user = await currentRequestUser(request);
  if (!user) return { ok: false as const, status: 401, error: "请先登录。" };
  if (user.role !== role) return { ok: false as const, status: 403, error: "当前账号无权执行此操作。" };
  return { ok: true as const, user };
}

export function safeSessionPayload(user: SafeUser) {
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
}
