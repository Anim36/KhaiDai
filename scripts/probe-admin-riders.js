// Probe /api/admin/riders API + check our new presence logic.
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const TOKEN = fs.readFileSync(path.join(__dirname, ".admin-token"), "utf8");

async function main() {
  const r = await fetch(`${BASE}/api/admin/riders`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  console.log("status:", r.status);
  const j = await r.json();
  const rows = j.riders ?? [];
  console.log("count:", rows.length);
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(20)} status=${row.status} lastSeen=${row.lastSeen}`,
    );
  }
}

main();