import "server-only";

import { ensureSchema } from "../step8a/database";
import { runtimeDb } from "./runtime.mjs";

const SLOT = 1;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const MAX_SESSION_MS = 5 * 60 * 1_000;
const GRACE_MS = 30_000;

async function purgeExpired(now = Date.now()) {
  await ensureSchema();
  await runtimeDb().prepare(
    "DELETE FROM liveavatar_leases WHERE slot=? AND (expires_at<=? OR heartbeat_at<=?)",
  ).bind(SLOT, now, now - HEARTBEAT_TIMEOUT_MS).run();
}

export async function acquireLiveAvatarLease(userId) {
  const now = Date.now();
  await purgeExpired(now);
  const leaseId = crypto.randomUUID();
  await runtimeDb().prepare(
    "INSERT INTO liveavatar_leases (slot,lease_id,user_id,state,expires_at,heartbeat_at,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(slot) DO NOTHING",
  ).bind(SLOT, leaseId, userId, "creating", now + MAX_SESSION_MS + GRACE_MS, now, new Date(now).toISOString()).run();
  const row = await runtimeDb().prepare(
    "SELECT lease_id,user_id,state,expires_at,heartbeat_at FROM liveavatar_leases WHERE slot=?",
  ).bind(SLOT).first();
  if (String(row?.lease_id || "") !== leaseId) {
    return {
      ok: false,
      state: String(row?.state || "active"),
      retryAfter: Math.max(2, Math.min(15, Math.ceil((Number(row?.expires_at || now + 15_000) - now) / 1_000))),
    };
  }
  return { ok: true, leaseId, maxSessionSeconds: Math.round(MAX_SESSION_MS / 1_000) };
}

export async function activateLiveAvatarLease(leaseId, userId) {
  const now = Date.now();
  const result = await runtimeDb().prepare(
    "UPDATE liveavatar_leases SET state='active',heartbeat_at=? WHERE slot=? AND lease_id=? AND user_id=?",
  ).bind(now, SLOT, leaseId, userId).run();
  return Number(result.meta?.changes || 0) > 0;
}

export async function heartbeatLiveAvatarLease(leaseId, userId) {
  const now = Date.now();
  await purgeExpired(now);
  const result = await runtimeDb().prepare(
    "UPDATE liveavatar_leases SET heartbeat_at=? WHERE slot=? AND lease_id=? AND user_id=?",
  ).bind(now, SLOT, leaseId, userId).run();
  return Number(result.meta?.changes || 0) > 0;
}

export async function releaseLiveAvatarLease(leaseId, userId) {
  await ensureSchema();
  if (!leaseId) return;
  await runtimeDb().prepare(
    "DELETE FROM liveavatar_leases WHERE slot=? AND lease_id=? AND user_id=?",
  ).bind(SLOT, leaseId, userId).run();
}
