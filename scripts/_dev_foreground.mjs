// scripts/_dev_foreground.mjs — run the dev server in the foreground
// to capture all output. Use with block_until_ms=30000 only.
import { spawn } from "child_process";
const proc = spawn("node", [
  "node_modules/next/dist/bin/next",
  "dev",
  "-p",
  "3001",
], { stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048" } });
proc.on("exit", (code) => process.exit(code ?? 0));
