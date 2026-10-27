import { randomBytes } from "node:crypto";

function token(bytes) {
  return randomBytes(bytes).toString("base64url");
}

console.log(`POSTGRES_PASSWORD=${token(24)}`);
console.log(`CLASSROOM_ADMIN_PASSWORD=T13${token(15)}`);
console.log(`APP_ENCRYPTION_KEY=${token(32)}`);

