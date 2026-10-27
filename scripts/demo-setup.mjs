import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
let content = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const values = {GENERATE_PROJECT:`geoai_demo_${randomBytes(6).toString('hex')}`, GENERATE_DATABASE_PASSWORD:randomBytes(24).toString('hex'), GENERATE_TEACHER_PASSWORD:`T${randomBytes(16).toString('hex')}`, GENERATE_STUDENT_PASSWORD:`S${randomBytes(16).toString('hex')}`, GENERATE_ENCRYPTION_KEY:randomBytes(32).toString('base64url')};
for (const [key,value] of Object.entries(values)) content=content.replaceAll(key,value);
await writeFile(new URL('../.env',import.meta.url),content,{flag:'wx',mode:0o600});
console.log('Created private .env and unique demo volume namespace. Read credentials locally; never commit this file.');
