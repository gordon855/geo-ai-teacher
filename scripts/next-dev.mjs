import { spawn } from "node:child_process";
import path from "node:path";

const incoming = process.argv.slice(2);
const forwarded = [];
for (let index = 0; index < incoming.length; index += 1) {
  const argument = incoming[index];
  if (argument === "--strictPort") continue;
  if (argument === "--host") {
    forwarded.push("--hostname");
    if (incoming[index + 1]) forwarded.push(incoming[++index]);
    continue;
  }
  forwarded.push(argument);
}
if (!forwarded.includes("--hostname")) forwarded.push("--hostname", "0.0.0.0");
if (!forwarded.includes("--port")) forwarded.push("--port", "3000");

const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", ...forwarded], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

