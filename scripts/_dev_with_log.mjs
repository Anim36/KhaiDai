// scripts/_dev_with_log.mjs — run dev server in the foreground but
// tee its output to a file via Node streams (avoids PowerShell
// redirect losing data).
import { spawn } from "child_process";
import { createWriteStream, existsSync } from "fs";

const logPath = ".next/dev-server-fg.log";
const stream = createWriteStream(logPath, { flags: "w" });
const proc = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "dev", "-p", "3001"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048" },
  },
);
proc.stdout.pipe(stream);
proc.stderr.pipe(stream);
proc.on("exit", (code) => {
  stream.write(`EXIT ${code}\n`);
  stream.end();
  process.exit(code ?? 0);
});

const shutdown = () => {
  try { proc.kill(); } catch {}
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
