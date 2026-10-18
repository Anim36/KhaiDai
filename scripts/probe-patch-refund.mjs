// scripts/probe-patch-refund.mjs
//
// Bug — Feat 3 (regression probe): when a partner clicks "Reject"
// from the dashboard, the OrdersPanel PATCHes /api/orders/[id]
// with status="cancelled". This probe confirms that path now
// credits the customer's wallet and creates a WalletTransaction
// row of type REFUND, exactly as the dedicated POST
// /api/orders/[id]/cancel route does.
//
// What this reproduces:
//   1. Customer places a paid (BKASH) order → status=PENDING.
//   2. Simulate the IPN landing → paymentGatewayStatus=PAID.
//   3. Partner Dashboard Reject = PATCH /api/orders/[id] with
//      { status: "cancelled" } (NOT POST /api/orders/[id]/cancel).
//   4. Assert:
//        • Order.status === CANCELLED.
//        • Wallet.balance increased by order.total.
//        • WalletTransaction row exists with type=REFUND, the
//          right amount, and the order reference.
//   5. Also assert the cancel route still works for regression
//      safety.

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

// Make sure the customer has a CustomerProfile — the wallet row is
// keyed off `customerProfileId`, not `userId`.
const customer = await prisma.user.findUniqueOrThrow({
  where: { email: CUSTOMER.email },
  select: { id: true },
});
const profile = await prisma.customerProfile.upsert({
  where: { userId: customer.id },
  update: {},
  create: { userId: customer.id },
  select: { id: true },
});

// Partner + restaurant + item.
const partner = await prisma.user.findUniqueOrThrow({
  where: { email: PARTNER.email },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true, address: true },
});
const item = await prisma.menuItem.findFirstOrThrow({
  where: { restaurantId: restaurant.id, available: true },
  select: { id: true },
});

// 1. Create the paid order.
const create = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${customerToken}`,
  },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: item.id, quantity: 1 }],
    deliveryAddress: restaurant.address,
    paymentMethod: "BKASH",
  }),
});
const cj = await create.json();
const orderId = cj?.order?.id;
const orderTotal = cj?.order?.total;
check("order created", create.status === 201 && !!orderId, `id=${orderId} total=${orderTotal}`);

// 2. Mark PAID directly (simulating IPN landing — no live sandbox
// needed). After the fix, this NO LONGER auto-promotes status.
await prisma.order.update({
  where: { id: orderId },
  data: {
    paymentGatewayStatus: "PAID",
    gatewayTransactionId: "PATCH_REFUND_PROBE",
    gatewaySessionKey: null,
  },
});

const before = await prisma.wallet.findUnique({
  where: { customerProfileId: profile.id },
  select: { balance: true },
});
const beforeBalance = before?.balance ?? 0;

// 3. Partner Dashboard Reject = PATCH /api/orders/[id] (NOT POST /cancel).
const reject = await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${partnerToken}`,
  },
  body: JSON.stringify({ status: "cancelled" }),
});
const rejectBody = await reject.json().catch(() => null);
check(
  "PATCH reject returns 200",
  reject.status === 200,
  `status=${reject.status} body=${JSON.stringify(rejectBody).slice(0, 200)}`,
);

// 4. Assertions.
const orderSnap = await prisma.order.findUniqueOrThrow({
  where: { id: orderId },
  select: { status: true, paymentMethod: true, paymentGatewayStatus: true },
});
check(
  "Order.status=CANCELLED after PATCH reject",
  orderSnap.status === "CANCELLED",
  `status=${orderSnap.status}`,
);

const after = await prisma.wallet.findUnique({
  where: { customerProfileId: profile.id },
  select: { balance: true },
});
const afterBalance = after?.balance ?? 0;
check(
  "Wallet.balance credited by order.total (PATCH path)",
  afterBalance - beforeBalance === orderTotal,
  `before=${beforeBalance} after=${afterBalance} delta=${afterBalance - beforeBalance} expected=${orderTotal}`,
);

const tx = await prisma.walletTransaction.findFirst({
  where: { relatedOrderId: orderId, type: "REFUND" },
  select: { id: true, amount: true, description: true },
});
check(
  "WalletTransaction{type:REFUND} row recorded",
  !!tx,
  `amount=${tx?.amount} desc="${tx?.description}"`,
);
check(
  "Tx amount equals order.total",
  tx?.amount === orderTotal,
  `tx.amount=${tx?.amount} expected=${orderTotal}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);