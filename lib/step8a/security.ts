import "server-only";

// The mainland Node.js deployment can use a stronger work factor. Step 12
// hashes used 100,000 rounds, so verification accepts both versions during a
// data migration while all newly created passwords use 210,000 rounds.
const PBKDF2_ITERATIONS = 210_000;
const LEGACY_PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const normalizedSalt = Uint8Array.from(salt);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: normalizedSalt, iterations },
    material,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return ["pbkdf2-sha256", PBKDF2_ITERATIONS, toBase64Url(salt), toBase64Url(derived)].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationValue, saltValue, hashValue] = storedHash.split("$");
  if (algorithm !== "pbkdf2-sha256" || !saltValue || !hashValue) return false;
  const iterations = Number(iterationValue);
  if (!Number.isInteger(iterations) || ![PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS].includes(iterations)) return false;
  try {
    const expected = fromBase64Url(hashValue);
    const actual = await deriveKey(password, fromBase64Url(saltValue), iterations);
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export function validateNewPassword(password: string) {
  if (password.length < 10) return "密码至少需要10位。";
  if (password.length > 128) return "密码不能超过128位。";
  if (!/[A-Za-z]/u.test(password) || !/[0-9]/u.test(password)) return "密码必须同时包含英文字母和数字。";
  return "";
}

export function generateTemporaryPassword(length = 12) {
  const bytes = randomBytes(length);
  let password = "";
  for (let index = 0; index < length; index += 1) password += TEMP_PASSWORD_ALPHABET[bytes[index] % TEMP_PASSWORD_ALPHABET.length];
  return password;
}

export function generateSessionToken() {
  return toBase64Url(randomBytes(32));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashSessionToken(token: string) {
  return sha256(token);
}

export function hashUserAgent(value: string) {
  return sha256(value.slice(0, 512));
}
