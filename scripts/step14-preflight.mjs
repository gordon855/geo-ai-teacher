import { readFile } from "node:fs/promises";
import path from "node:path";

function parseEnvironment(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const split = line.indexOf("=");
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    let value = line.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const environmentPath = path.resolve(process.argv[2] || ".env");
let fileValues;
try {
  fileValues = parseEnvironment(await readFile(environmentPath, "utf8"));
} catch {
  throw new Error(`找不到${environmentPath}。升级时请从第15版复制原.env；全新部署可复制config/step17.env.example。`);
}
const environment = { ...fileValues, ...process.env };
const required = [
  "ROOT_DOMAIN", "WWW_DOMAIN", "CLASSROOM_PUBLIC_ORIGIN", "LETSENCRYPT_EMAIL",
  "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "CLASSROOM_ADMIN_USERNAME",
  "CLASSROOM_ADMIN_PASSWORD", "APP_ENCRYPTION_KEY", "SITE_PRIVACY_CONTACT", "STORAGE_DRIVER",
];
if (!new Set(["YES", "NO"]).has(String(environment.ICP_APPROVED || "NO").toUpperCase())) {
  throw new Error("ICP_APPROVED只能填写YES或NO。");
}
if (String(environment.ICP_APPROVED || "NO").toUpperCase() === "YES") required.push("SITE_ICP_NUMBER");
if (environment.STORAGE_DRIVER === "oss") required.push(
  "OSS_REGION", "OSS_ENDPOINT", "OSS_BUCKET", "ALIBABA_CLOUD_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
);
const missing = required.filter((key) => !String(environment[key] || "").trim());
if (missing.length) throw new Error(`缺少配置：${missing.join("、")}`);
const placeholders = required.filter((key) => /CHANGE_ME|请填写/u.test(String(environment[key] || "")));
if (placeholders.length) throw new Error(`仍有示例值未修改：${placeholders.join("、")}`);
if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(environment.ROOT_DOMAIN)) {
  throw new Error("ROOT_DOMAIN格式无效，只填写根域名，不要填写https://或路径。");
}
if (environment.WWW_DOMAIN !== `www.${environment.ROOT_DOMAIN}`) throw new Error("WWW_DOMAIN必须是www.加ROOT_DOMAIN。");
if (environment.CLASSROOM_PUBLIC_ORIGIN !== `https://${environment.WWW_DOMAIN}`) throw new Error("CLASSROOM_PUBLIC_ORIGIN必须是https://加WWW_DOMAIN，末尾不要加斜线。");
if (!/^[A-Za-z0-9._~-]{20,}$/u.test(environment.POSTGRES_PASSWORD)) throw new Error("POSTGRES_PASSWORD至少20位，并只使用字母、数字、点、下划线、波浪线或连字符。");
if (environment.CLASSROOM_ADMIN_PASSWORD.length < 10 || !/[A-Za-z]/u.test(environment.CLASSROOM_ADMIN_PASSWORD) || !/[0-9]/u.test(environment.CLASSROOM_ADMIN_PASSWORD)) {
  throw new Error("CLASSROOM_ADMIN_PASSWORD至少10位，并同时包含英文字母和数字。");
}
if (Buffer.from(environment.APP_ENCRYPTION_KEY, "base64url").byteLength !== 32) throw new Error("APP_ENCRYPTION_KEY必须是32字节Base64URL密钥。");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(environment.LETSENCRYPT_EMAIL)) throw new Error("LETSENCRYPT_EMAIL格式无效。");
console.log("版本17配置预检通过：域名、数据库、教师账号、加密密钥与存储参数格式正确。未打印任何密钥。");
