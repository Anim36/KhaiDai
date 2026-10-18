// Run dev server in foreground, log to file via Node process — works around
// the PowerShell `Start-Process` stdio redirect quirks on this box.
import { spawn } from "child_process";
import { createWriteStream } from "fs";
const stream = createWriteStream("dev-server-bg.log", { flags: "w" });
const proc = spawn("node", [
  "node_modules/next/dist/bin/next", "dev", "-p", "3001",
], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048", FORCE_COLOR: "0" },
});
proc.stdout.pipe(stream);
proc.stderr.pipe(stream);
proc.on("exit", (code) => { stream.write(`\n[exit ${code}]\n`); stream.end(); });
process.on("SIGINT", () => proc.kill());
process.on("SIGTERM", () => proc.kill());
