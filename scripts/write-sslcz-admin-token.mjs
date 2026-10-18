// scripts/write-sslcz-admin-token.mjs
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";
const __dirname = dirname(fileURLToPath(import.meta.url));

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "sslcz.admin@example.com",
    password: "Pa55word!",
    expectedRole: "ADMIN",
  }),
});
if (!r.ok) {
  console.error(`login failed: ${r.status} ${await r.text()}`);
  process.exit(1);
}
const j = await r.json();
writeFileSync(join(__dirname, ".admin-token"), j.token);
console.log(`wrote sslcz admin token, len=${j.token.length}`);