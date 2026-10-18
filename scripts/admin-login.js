// Sign in as the seeded admin and save the JWT token to .admin-token.
const fs = require("node:fs");
const path = require("node:path");
const BASE = "http://localhost:3000";

async function main() {
  const c = {
    email: "admin@khaidai.test",
    password: "khaidai1234",
    expectedRole: "ADMIN",
  };
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(c),
  });
  console.log("status:", r.status);
  if (r.status !== 200) {
    console.log("body:", await r.text());
    process.exit(1);
  }
  const j = await r.json();
  const token = j.token;
  if (!token) {
    console.log("no token in body:", JSON.stringify(j));
    process.exit(1);
  }
  const out = path.join(__dirname, ".admin-token");
  fs.writeFileSync(out, token);
  console.log("wrote", out, "len=", token.length);
}

main();