// Dump every table we care about for a schema-verification backup.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) { console.error("usage: node _dump_db.mjs <out.json>"); process.exit(2); }

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const tables = [
  "user", "restaurant", "menuItem", "order", "orderItem",
  "address", "paymentMethod", "review", "favorite", "promoCode",
  "riderProfile", "riderOnlineSession", "deliveryFeeConfig", "auditLog",
  "restaurantOnlineSession",
];

const dump = {};
for (const t of tables) {
  const m = prisma[t.charAt(0).toLowerCase() + t.slice(1)];
  if (!m) continue;
  try {
    dump[t] = await m.findMany({});
    console.log(`dumped ${t}: ${dump[t].length}`);
  } catch (err) {
    console.log(`skip ${t}: ${err.message}`);
  }
}

writeFileSync(out, JSON.stringify(dump, null, 2));
console.log("wrote " + out);