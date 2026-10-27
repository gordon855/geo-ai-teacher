import "server-only";

import crypto from "node:crypto";

const CAPACITY_SYMBOL = Symbol.for("surveying-ai-teacher.step11.avatar-capacity");

function state() {
  if (!globalThis[CAPACITY_SYMBOL]) {
    globalThis[CAPACITY_SYMBOL] = { leases: new Map() };
  }
  return globalThis[CAPACITY_SYMBOL];
}

function sweep(now = Date.now()) {
  const current = state();
  for (const [leaseId, lease] of current.leases) {
    if (lease.expiresAt <= now) current.leases.delete(leaseId);
  }
  return current;
}

export function avatarCapacitySnapshot(settings, now = Date.now()) {
  const current = sweep(now);
  return {
    active: current.leases.size,
    limit: settings.activeLimit,
    designedCapacity: settings.designedCapacity,
    available: Math.max(0, settings.activeLimit - current.leases.size),
  };
}

export function acquireAvatarLease(settings, metadata = {}, now = Date.now()) {
  const current = sweep(now);
  if (current.leases.size >= settings.activeLimit) {
    return {
      ok: false,
      retryAfter: 5,
      active: current.leases.size,
      limit: settings.activeLimit,
      designedCapacity: settings.designedCapacity,
      queuePosition: Math.max(1, current.leases.size - settings.activeLimit + 1),
    };
  }
  const leaseId = crypto.randomUUID();
  const lease = {
    id: leaseId,
    createdAt: now,
    expiresAt: now + settings.sessionTtlMs,
    userId: String(metadata.userId || "anonymous"),
  };
  current.leases.set(leaseId, lease);
  return {
    ok: true,
    leaseId,
    expiresAt: lease.expiresAt,
    active: current.leases.size,
    limit: settings.activeLimit,
    designedCapacity: settings.designedCapacity,
  };
}

export function releaseAvatarLease(leaseId, now = Date.now()) {
  const current = sweep(now);
  if (!leaseId) return false;
  return current.leases.delete(String(leaseId));
}

export function resetAvatarCapacityForTests() {
  state().leases.clear();
}
