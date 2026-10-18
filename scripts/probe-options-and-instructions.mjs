// scripts/probe-options-and-instructions.mjs
//
// Feat 1 + Feat 2 + Feat 3 verification:
//   1. Seed two option groups on the partner's menu item:
//        • "Size" (SINGLE_CHOICE, required): Small (-৳20), Large (+৳40)
//        • "Extra Toppings" (MULTI_CHOICE, optional): Egg (+৳30), Cheese (+৳40)
//   2. Place an order with selectedOptions = [{Size→Large, Toppings→Egg}]
//        • Server should accept, recompute price = base + 40 + 30 = 220 + 70 = 290
//        • DB row stores OrderItem.selectedOptions snapshot
//        • Order carries specialInstructions text
//   3. Reject hack attempts (missing required, wrong option id, off-calc
//      price, oversized instructions)
//   4. Validate via formatOrderResponse-shape that snapshot fields
//      round-trip on GET /api/orders/[id]

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Pa55word!";
const CUSTOMER = {
  email: "sslcz.customer@example.com",
  password: PASSWORD,
  expectedRole: "CUSTOMER",
};
const PARTNER = {
  email: "sslcz.partner@example.com",
  password: PASSWORD,
  expectedRole: "PARTNER",
};

const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: a });

let pass = 0, fail = 0;
function check(name, ok, info = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}${info ? " — " + info : ""}`); }
  else    { fail++; console.log(`  ✗ ${name}${info ? " — " + info : ""}`); }
}

async function login({ email, password, expectedRole }) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).token;
}

const customerToken = await login(CUSTOMER);
const partnerToken = await login(PARTNER);

const partner = await prisma.user.findUniqueOrThrow({
  where: { email: PARTNER.email },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true, address: true },
});
const item = await prisma.menuItem.findFirstOrThrow({
  where: { restaurantId: restaurant.id, available: true, deletedAt: null },
  select: { id: true, price: true, name: true },
});

console.log(`Test item: ${item.name} (${item.price} ৳)`);

// Clean any prior options on this item (re-runnable).
await prisma.menuItemOption.deleteMany({ where: { menuItemId: item.id } });

// Seed: two groups.
const size = await prisma.menuItemOption.create({
  data: {
    menuItemId: item.id,
    name: "Size",
    type: "SINGLE_CHOICE",
    required: true,
    sortOrder: 0,
    choices: {
      create: [
        { label: "Small", priceDelta: -20, sortOrder: 0 },
        { label: "Large", priceDelta: 40, sortOrder: 1 },
      ],
    },
  },
  include: { choices: true },
});
const toppings = await prisma.menuItemOption.create({
  data: {
    menuItemId: item.id,
    name: "Extra Toppings",
    type: "MULTI_CHOICE",
    required: false,
    sortOrder: 1,
    choices: {
      create: [
        { label: "Egg", priceDelta: 30, sortOrder: 0 },
        { label: "Cheese", priceDelta: 40, sortOrder: 1 },
      ],
    },
  },
  include: { choices: true },
});
const sizeChoices = size.choices;
const toppingChoices = toppings.choices;
check(
  "seeded 2 option groups with 4 choices total",
  sizeChoices.length === 2 && toppingChoices.length === 2,
  `size=${sizeChoices.length} toppings=${toppingChoices.length}`,
);

const large = sizeChoices.find((c) => c.label === "Large");
const egg = toppingChoices.find((c) => c.label === "Egg");
const cheese = toppingChoices.find((c) => c.label === "Cheese");

// Helper: place an order with given items + instructions.
async function placeOrder(items, specialInstructions) {
  const r = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      restaurantId: restaurant.id,
      items,
      deliveryAddress: restaurant.address,
      paymentMethod: "CASH",
      ...(specialInstructions !== undefined ? { specialInstructions } : {}),
    }),
  });
  return r;
}

// ---- 1. Happy path: Large + Egg = base 220 + 40 + 30 = 290 ৳/unit
const expectedUnitPrice = item.price + 40 + 30; // 290
const happy = await placeOrder(
  [
    {
      menuItemId: item.id,
      quantity: 2,
      selectedOptions: [
        { optionId: size.id, choiceIds: [large.id] },
        { optionId: toppings.id, choiceIds: [egg.id] },
      ],
    },
  ],
  "Ring the bell twice, please",
);
check("happy POST /api/orders returns 201", happy.status === 201, `status=${happy.status}`);
const hj = await happy.json();
const happyOrderId = hj?.order?.id;
check(
  "server-recomputed subtotal = unitPrice * qty (290*2=580)",
  hj?.order?.subtotal === expectedUnitPrice * 2,
  `subtotal=${hj?.order?.subtotal} expected=${expectedUnitPrice * 2}`,
);
check(
  "OrderItem.price stored server-side as unitPrice",
  Array.isArray(hj?.order?.items) &&
    hj.order.items[0]?.price === expectedUnitPrice,
  `linePrice=${hj?.order?.items?.[0]?.price} expected=${expectedUnitPrice}`,
);
check(
  "selectedOptions snapshot persisted on OrderItem",
  Array.isArray(hj?.order?.items?.[0]?.selectedOptions) &&
    hj.order.items[0].selectedOptions.length === 2,
  `snapshot=${JSON.stringify(hj?.order?.items?.[0]?.selectedOptions)}`,
);
check(
  "specialInstructions persisted on Order",
  hj?.order?.specialInstructions === "Ring the bell twice, please",
  `value="${hj?.order?.specialInstructions}"`,
);

// DB-level confirmation: OrderItem.selectedOptions is JSON, not null.
const dbItem = await prisma.orderItem.findFirst({
  where: { orderId: happyOrderId },
  select: { selectedOptions: true, price: true },
});
check(
  "DB row OrderItem.selectedOptions is non-null",
  dbItem?.selectedOptions !== null,
  `selectedOptions=${JSON.stringify(dbItem?.selectedOptions)}`,
);

// Round-trip via GET /api/orders/[id] should expose the same fields.
const fetched = await fetch(`${BASE}/api/orders/${happyOrderId}`, {
  headers: { authorization: `Bearer ${customerToken}` },
});
const fj = await fetched.json();
check(
  "GET /api/orders/[id] echoes selectedOptions",
  Array.isArray(fj?.order?.items?.[0]?.selectedOptions) &&
    fj.order.items[0].selectedOptions.length === 2,
  `len=${fj?.order?.items?.[0]?.selectedOptions?.length}`,
);
check(
  "GET /api/orders/[id] echoes specialInstructions",
  fj?.order?.specialInstructions === "Ring the bell twice, please",
);

// ---- 2. Validation: skip "Size" entirely (required) → must reject
const noRequired = await placeOrder(
  [
    {
      menuItemId: item.id,
      quantity: 1,
      selectedOptions: [{ optionId: toppings.id, choiceIds: [egg.id] }],
    },
  ],
);
check(
  "missing required Size → 400",
  noRequired.status === 400,
  `status=${noRequired.status}`,
);

// ---- 3. Validation: spoofed optionId belonging to another item → 400
const foreign = await placeOrder(
  [
    {
      menuItemId: item.id,
      quantity: 1,
      selectedOptions: [{ optionId: "clx0000000000000000000aaaa", choiceIds: [large.id] }],
    },
  ],
);
check(
  "foreign optionId → 400",
  foreign.status === 400,
  `status=${foreign.status}`,
);

// ---- 4. Validation: oversized specialInstructions → 400
const tooLong = "x".repeat(400);
const oversized = await placeOrder(
  [{ menuItemId: item.id, quantity: 1 }],
  tooLong,
);
check(
  "specialInstructions >300 chars → 400",
  oversized.status === 400,
  `status=${oversized.status}`,
);

// ---- 5. Client-trust guard: client submits selectedOptions with a
//        negative priceDelta sum, hoping the server accepts the
//        discount. Server must recompute.
const tampered = await placeOrder(
  [
    {
      menuItemId: item.id,
      quantity: 1,
      // Client claims "Large" but tries to pass zero priceDelta via
      // submitting size.small (no effect, server still recomputes
      // base+0). We assert the server ignored whatever the client
      // implied and recomputed from the chosen choice's priceDelta.
      selectedOptions: [
        { optionId: size.id, choiceIds: [large.id] },
      ],
    },
  ],
);
const tj = await tampered.json();
check(
  "server recomputes price (Large → +40 ৳)",
  tj?.order?.items?.[0]?.price === item.price + 40,
  `linePrice=${tj?.order?.items?.[0]?.price} expected=${item.price + 40}`,
);

// ---- 6. Without selectedOptions on a menu item that has NO options:
//        legacy back-compat path.
const legacyItem = await prisma.menuItem.upsert({
  where: { id: "__legacy_probe_item__" },
  update: { available: true },
  create: {
    id: "__legacy_probe_item__",
    restaurantId: restaurant.id,
    name: "Legacy Probe Item",
    price: 150,
    category: "test",
    available: true,
  },
});
const legacy = await placeOrder(
  [{ menuItemId: legacyItem.id, quantity: 1 }],
);
check(
  "no options on item → order accepted without selectedOptions",
  legacy.status === 201,
  `status=${legacy.status}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === "PASS" ? "PASS" : fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);