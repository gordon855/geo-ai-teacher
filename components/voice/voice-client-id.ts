"use client";

const STORAGE_KEY = "surveying-ai-teacher.voice-client-id.v1";
let memoryId = "";

function makeId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `voice-${random}`.slice(0, 64);
}

export function voiceClientId() {
  if (memoryId) return memoryId;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY) || "";
    if (/^voice-[a-z0-9-]{8,58}$/iu.test(stored)) memoryId = stored;
    else {
      memoryId = makeId();
      window.sessionStorage.setItem(STORAGE_KEY, memoryId);
    }
  } catch {
    memoryId = makeId();
  }
  return memoryId;
}
