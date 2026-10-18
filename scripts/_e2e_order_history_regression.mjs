// Regression: verify the Order History API still returns real
// restaurant.name + menuItem.name (the bangla bug-2 fix). We:
//   1. Seed customer + partner + restaurant + dish.
//   2. POST a new order via the normal flow.
//   3. GET /api/orders and verify:
//        • restaurant.name = joined Restaurant row (not hardcoded)
//        • items[].name = joined MenuItem.name (not hardcoded)
//        • status = "pending" (lowercase API convention)

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function randPhone() {
  return `+88017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}
let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

async function ensureUser(email, role, name) {
  let u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.default.hash("khaidai1234", 12);
    u = await prisma.user.create({
      data: {
        email,
        name: name ?? `${role} order-hist`,
        role,
        password: hash,
        phone: randPhone(),
      },
    });
  }
  return u;
}

const CUST_EMAIL = `cust-orders-e2e-${Date.now()}@khaidai.test`;
const PART_EMAIL = `part-orders-e2e-${Date.now()}@khaidai.test`;
const cust = await ensureUser(CUST_EMAIL, "CUSTOMER", "Order Hist Customer");
const partner = await ensureUser(PART_EMAIL, "PARTNER", "Order Hist Partner");

const restName = `Order Hist Rest ${Date.now()}`;
const rest = await prisma.restaurant.create({
  data: {
    ownerId: partner.id,
    name: restName,
    address: "Order Hist Addr",
    cuisine: "Test",
    latitude: 23.78,
    longitude: 90.4,
    deliveryTime: 30,
    deliveryFee: 50,
  },
});
const itemName = `Order Hist Dish ${Date.now()}`;
const item = await prisma.menuItem.create({
  data: {
    restaurantId: rest.id,
    name: itemName,
    price: 250,
    category: "Mains",
    available: true,
  },
});
const addr = await prisma.address.findFirst({ where: { userId: cust.id } }) ??
  await prisma.address.create({
    data: {
      userId: cust.id,
      label: "HOME",
      fullAddress: "House 1, Dhaka",
      city: "Dhaka",
      latitude: 23.7461,
      longitude: 90.3742,
      isDefault: true,
    },
  });

const custLogin = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: CUST_EMAIL, password: "khaidai1234", expectedRole: "CUSTOMER" }),
});
const custToken = (await custLogin.json()).token;
if (!custToken) throw new Error("customer login failed");

const placed = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${custToken}` },
  body: JSON.stringify({
    restaurantId: rest.id,
    items: [{ menuItemId: item.id, quantity: 1 }],
    deliveryAddress: addr.fullAddress,
    deliveryLat: addr.latitude,
    deliveryLng: addr.longitude,
    paymentMethod: "CASH",
  }),
});
const placedJson = await placed.json().catch(() => ({}));
record(
  "POST /api/orders places a new order",
  placed.status === 201 && typeof placedJson.order?.id === "string",
  `status=${placed.status}`,
);

const list = await fetch(`${BASE}/api/orders`, {
  headers: { authorization: `Bearer ${custToken}` },
});
const listJson = await list.json().catch(() => ({}));
const order = Array.isArray(listJson.orders)
  ? listJson.orders.find((o) => o.id === placedJson.order?.id)
  : null;
record(
  "GET /api/orders returns the newly placed order",
  order !== null && order !== undefined,
  `order id=${order?.id}`,
);
record(
  "Order.restaurant.name is the joined Restaurant row (bug 2 fix)",
  order?.restaurant?.name === restName,
  `name=${order?.restaurant?.name} expected=${restName}`,
);
record(
  "Order.items[].name is the joined MenuItem.name (bug 2 fix)",
  order?.items?.[0]?.name === itemName,
  `name=${order?.items?.[0]?.name} expected=${itemName}`,
);
record(
  "Order.status is 'pending' (lowercase API convention)",
  order?.status === "pending",
  `status=${order?.status}`,
);

// Cleanup
await prisma.orderItem.deleteMany({ where: { orderId: placedJson.order.id } });
await prisma.order.delete({ where: { id: placedJson.order.id } });
await prisma.menuItem.delete({ where: { id: item.id } });
await prisma.restaurant.delete({ where: { id: rest.id } }).catch(() => {});

console.log("\n================================================");
console.log(`ORDER HISTORY REGRESSION E2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);