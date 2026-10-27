import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createStorageBucket } from "../lib/mainland/storage.mjs";

const source = path.resolve(process.argv[2] || "");
if (!source.startsWith("/app/backups/") || !source.endsWith(".dump")) throw new Error("备份路径无效。");
const info = await stat(source);
if (!info.isFile() || info.size < 100) throw new Error("备份文件为空或不完整。");
const key = `backups/postgres/${path.basename(source)}`;
await createStorageBucket().put(key, await readFile(source), { httpMetadata: { contentType: "application/octet-stream" } });
console.log(`数据库备份已复制到私有存储：${key}`);

