// scripts/probe-restaurant-orders.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const token = readFileSync(join(__dirname, ".admin-token"), "utf8").trim();
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

for (const path of [
  "/api/orders?pageSize=10",
  "/api/admin/orders?pageSize=10",
]) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`${path}: ${r.status}`);
  if (r.ok) {
    const j = await r.json();
    const list = j.orders ?? j.items ?? [];
    console.log(`  ${list.length} rows`);
    for (const o of list.slice(0, 5)) {
      console.log(
        `  ${o.id?.slice(-6)} status=${o.status} payment=${o.paymentMethod} gateway=${o.paymentGatewayStatus}`,
      );
    }
  }
}