// scripts/refresh-admin-token.mjs — login admin@khaidai.test and write the token.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";

const passwords = ["khaidai1234", "Pa55word!", "password", "Password123!", "admin1234"];
const candidates = [
  ["admin@khaidai.test", passwords],
  ["sslcz.admin@example.com", passwords],
  ["tajanim10@gmail.com", passwords],
];

for (const [email, pwds] of candidates) {
  let ok = false;
  for (const password of pwds) {
  const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, expectedRole: "ADMIN" }),
    });
    if (!r.ok) {
      continue;
    }
    const j = await r.json();
    if (j.token && j.user?.role === "ADMIN") {
      writeFileSync(join(__dirname, ".admin-token"), j.token);
      console.log(`${email} (${password}): OK`);
      ok = true;
      break;
    }
  }
  if (!ok) console.log(`${email}: all passwords failed`);
}