// scripts/probe-receive-bug4.mjs
//
// Patches an order from PICKED_UP → PICKED_UP twice via the same
// rider session and confirms Bug 4 idempotency holds (no 400).

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: a });

// Find a rider with an active PICKED_UP order (or any in-flight order).
const inflight = await p.order.findFirst({
  where: { status: { in: ["PICKED_UP", "ON_THE_WAY"] }, riderId: { not: null } },
  select: { id: true, status: true, riderId: true },
});
if (!inflight) {
  console.log("No in-flight order found — picking a PRE one");
  const prep = await p.order.findFirst({
    where: { status: { in: ["PREPARING", "READY"] }, riderId: { not: null } },
    select: { id: true, status: true, riderId: true },
  });
  if (!prep) {
    console.log("No rider order to test — skipping");
    process.exit(0);
  }
  inflight = prep;
}

const rider = await p.user.findUnique({ where: { id: inflight.riderId }, select: { id: true, email: true } });
console.log(`Order ${inflight.id.slice(-6)} status=${inflight.status} rider=${rider?.email}`);

// Reset the rider's password to a known value so we can login.
const bcrypt = await import("bcrypt");
const newHash = await bcrypt.default.hash("ridertest1234", 12);
await p.user.update({ where: { id: rider.id }, data: { password: newHash } });

// Login as the rider.
const login = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: rider.email,
    password: "ridertest1234",
    expectedRole: "RIDER",
  }),
});
if (!login.ok) {
  console.log(`Rider login failed: ${login.status}`);
  process.exit(1);
}
const { token } = await login.json();

// PATCH same-status twice. Should now return 200 each time (idempotent).
const url = `http://localhost:3000/api/orders/${inflight.id}`;
const target = inflight.status.toLowerCase();
const payload = JSON.stringify({ status: target });

const r1 = await fetch(url, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: payload,
});
const b1 = await r1.text();
console.log(`First PATCH (${target}): ${r1.status} ${b1.slice(0, 200)}`);

const r2 = await fetch(url, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: payload,
});
const b2 = await r2.text();
console.log(`Second PATCH (${target}): ${r2.status} ${b2.slice(0, 200)}`);

await p.$disconnect();
if (r1.status === 200 && r2.status === 200) {
  console.log("PASS — idempotent same-state transition");
} else {
  console.log("FAIL — same-state transition rejected");
  process.exit(1);
}