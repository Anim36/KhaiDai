import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const token = readFileSync(join(__dirname, ".admin-token"), "utf8").trim();
const r = await fetch("http://localhost:3000/api/admin/riders", { headers: { Authorization: `Bearer ${token}` } });
const j = await r.json();
const rows = j.riders ?? [];
for (const r of rows) console.log(`${r.name.padEnd(20)} status=${r.status} lastSeen=${r.lastSeen}`);