import { createPostgresD1Database } from "./postgres-d1.mjs";
import { createStorageBucket } from "./storage.mjs";

let initializationPromise;

export async function initializeMainlandRuntime() {
  const globalScope = globalThis;
  if (globalScope.__SURVEYING_RUNTIME_ENV__?.DB && globalScope.__SURVEYING_RUNTIME_ENV__?.BUCKET) {
    return globalScope.__SURVEYING_RUNTIME_ENV__;
  }
  initializationPromise ||= (async () => {
    const database = createPostgresD1Database();
    await database.healthcheck();
    const bucket = createStorageBucket();
    const runtime = { DB: database, BUCKET: bucket, DEPLOYMENT_TARGET: "self-hosted" };
    globalScope.__SURVEYING_RUNTIME_ENV__ = runtime;
    return runtime;
  })().catch((error) => {
    initializationPromise = undefined;
    throw error;
  });
  return initializationPromise;
}
