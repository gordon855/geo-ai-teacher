import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

async function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof Blob !== "undefined" && value instanceof Blob) return Buffer.from(await value.arrayBuffer());
  if (value instanceof ReadableStream) return Buffer.from(await new Response(value).arrayBuffer());
  throw new TypeError("不支持的文件数据类型。");
}

function exactArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function missingObject(error) {
  return Number(error?.status || error?.statusCode) === 404 || error?.code === "NoSuchKey";
}

class OssBucketAdapter {
  constructor(options) {
    this.options = options;
    this.clientPromise = null;
  }

  async client() {
    this.clientPromise ||= import("ali-oss").then((module) => {
      const OSS = module.default || module;
      return new OSS(this.options);
    });
    return this.clientPromise;
  }

  async head(key) {
    try {
      const result = await (await this.client()).head(key);
      const size = Number(result?.res?.headers?.["content-length"] || result?.meta?.size || 0);
      return { key, size };
    } catch (error) {
      if (missingObject(error)) return null;
      throw error;
    }
  }

  async get(key) {
    try {
      const result = await (await this.client()).get(key);
      const content = Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content || "");
      return { key, size: content.byteLength, arrayBuffer: async () => exactArrayBuffer(content) };
    } catch (error) {
      if (missingObject(error)) return null;
      throw error;
    }
  }

  async put(key, value, options = {}) {
    const content = await toBuffer(value);
    const http = options.httpMetadata || {};
    const headers = {
      ...(http.contentType ? { "Content-Type": http.contentType } : {}),
      ...(http.contentDisposition ? { "Content-Disposition": http.contentDisposition } : {}),
    };
    for (const [name, metadataValue] of Object.entries(options.customMetadata || {})) {
      headers[`x-oss-meta-${name.toLowerCase()}`] = encodeURIComponent(String(metadataValue));
    }
    await (await this.client()).put(key, content, { headers });
    return { key, size: content.byteLength };
  }

  async delete(key) {
    try {
      await (await this.client()).delete(key);
    } catch (error) {
      if (!missingObject(error)) throw error;
    }
  }
}

class LocalBucketAdapter {
  constructor(root) {
    this.root = path.resolve(root);
  }

  objectPath(key) {
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("文件对象路径无效。");
    }
    return target;
  }

  async head(key) {
    try {
      const info = await stat(this.objectPath(key));
      return { key, size: info.size };
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async get(key) {
    try {
      const content = await readFile(this.objectPath(key));
      return { key, size: content.byteLength, arrayBuffer: async () => exactArrayBuffer(content) };
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async put(key, value) {
    const target = this.objectPath(key);
    const content = await toBuffer(value);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { mode: 0o600 });
    return { key, size: content.byteLength };
  }

  async delete(key) {
    await rm(this.objectPath(key), { force: true });
  }
}

export function createStorageBucket(environment = process.env) {
  const driver = String(environment.STORAGE_DRIVER || "local").trim().toLowerCase();
  if (driver === "local") {
    return new LocalBucketAdapter(environment.LOCAL_STORAGE_PATH || path.join(process.cwd(), ".data", "storage"));
  }
  if (driver !== "oss") throw new Error("STORAGE_DRIVER只支持oss或local。");
  const required = ["OSS_BUCKET", "ALIBABA_CLOUD_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_SECRET"];
  const missing = required.filter((key) => !String(environment[key] || "").trim());
  if (missing.length) throw new Error(`阿里云OSS配置不完整：${missing.join("、")}`);
  return new OssBucketAdapter({
    region: environment.OSS_REGION || "oss-cn-beijing",
    endpoint: environment.OSS_ENDPOINT || "https://oss-cn-beijing-internal.aliyuncs.com",
    bucket: environment.OSS_BUCKET,
    accessKeyId: environment.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: environment.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    secure: true,
    timeout: 60_000,
  });
}
