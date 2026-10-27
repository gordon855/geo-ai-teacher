export async function register() {
 if (process.env.NEXT_RUNTIME === "nodejs") {
  if (process.env.SKIP_MAINLAND_RUNTIME === "1") return;
  const { initializeMainlandRuntime } = await import("./lib/mainland/bootstrap.mjs");
  await initializeMainlandRuntime();
 }
}
