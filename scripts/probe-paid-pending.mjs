// scripts/probe-paid-pending.mjs
//
// Bug 1 — end-to-end probe for the "paid order stays PENDING"
// contract.

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
  const j = await r.json();
  return j.token;
}

const customerToken = await login(CUSTOMER);
const partnerToken = await login(PARTNER);

const partner = await prisma.user.findUniqueOrThrow({
  where: { email: PARTNER.email },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true, name: true, address: true },
});
const item = await prisma.menuItem.findFirstOrThrow({
  where: { restaurantId: restaurant.id, available: true },
  select: { id: true, name: true },
});

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
check("order created", create.status === 201 && !!orderId, `status=${create.status}`);

let snap = await prisma.order.findUniqueOrThrow({
  where: { id: orderId },
  select: { status: true, paymentMethod: true, paymentGatewayStatus: true },
});
check(
  "after create: status=PENDING gateway=NOT_INITIATED",
  snap.status === "PENDING" && snap.paymentGatewayStatus === "NOT_INITIATED",
  `status=${snap.status} gateway=${snap.paymentGatewayStatus}`,
);

const init = await fetch(`${BASE}/api/payments/sslcommerz/init`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${customerToken}`,
  },
  body: JSON.stringify({ orderId }),
});
check("init returns 200", init.status === 200, `status=${init.status}`);

snap = await prisma.order.findUniqueOrThrow({
  where: { id: orderId },
  select: { status: true, paymentGatewayStatus: true, gatewaySessionKey: true },
});
check(
  "after init: status still PENDING gateway=PENDING",
  snap.status === "PENDING" && snap.paymentGatewayStatus === "PENDING",
  `status=${snap.status} gateway=${snap.paymentGatewayStatus}`,
);

// Simulate the IPPA side's PAID.
await prisma.order.update({
  where: { id: orderId },
  data: {
    paymentGatewayStatus: "PAID",
    gatewayTransactionId: "TEST_PROBE_NOOP",
    gatewaySessionKey: null,
  },
});
snap = await prisma.order.findUniqueOrThrow({
  where: { id: orderId },
  select: { status: true, paymentGatewayStatus: true },
});
check(
  "after PAID simulation: status still PENDING (Bug 1 contract)",
  snap.status === "PENDING" && snap.paymentGatewayStatus === "PAID",
  `status=${snap.status} gateway=${snap.paymentGatewayStatus}`,
);

const partnerOrders = await fetch(`${BASE}/api/orders`, {
  headers: { authorization: `Bearer ${partnerToken}` },
}).then((r) => r.json());
const ourOrder = partnerOrders?.orders?.find((o) => o.id === orderId);
check(
  "partner queue contains the paid-pending order",
  !!ourOrder,
  `status=${ourOrder?.status} (${(partnerOrders?.orders ?? []).length} in queue)`,
);
check(
  "partner sees the order with status=pending (UI shows Accept/Reject)",
  ourOrder?.status === "pending",
  `status=${ourOrder?.status}`,
);

// Partner rejects — wallet should refund (since gateway=PAID).
const customer = await prisma.user.findUniqueOrThrow({
  where: { email: CUSTOMER.email },
  select: { id: true },
});
// Backfill a CustomerProfile if the fixture didn't create one —
// the cancel route's wallet refund is keyed off profile.id; the
// probe needs it to verify the credit-and-notify path.
const profile = await prisma.customerProfile.upsert({
  where: { userId: customer.id },
  update: {},
  create: { userId: customer.id },
  select: { id: true },
});
const before = profile
  ? await prisma.wallet.findUnique({
      where: { customerProfileId: profile.id },
      select: { balance: true },
    })
  : null;
const beforeBalance = before?.balance ?? 0;

const cancel = await fetch(`${BASE}/api/orders/${orderId}/cancel`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${partnerToken}`,
  },
  body: JSON.stringify({}),
});
check("partner cancel returns 200", cancel.status === 200, `status=${cancel.status}`);

const afterSnap = await prisma.order.findUniqueOrThrow({
  where: { id: orderId },
  select: { status: true },
});
check(
  "after reject: order.status=CANCELLED",
  afterSnap.status === "CANCELLED",
  `status=${afterSnap.status}`,
);

const after = profile
  ? await prisma.wallet.findUnique({
      where: { customerProfileId: profile.id },
      select: { balance: true },
    })
  : null;
check(
  "wallet credited after partner-cancel of a paid order (refund)",
  after ? after.balance > beforeBalance : true,
  `${beforeBalance} → ${after?.balance}`,
);

const tx = await prisma.walletTransaction.findFirst({
  where: { relatedOrderId: orderId, type: "REFUND" },
  select: { id: true, amount: true },
});
check(
  "wallet REFUND transaction row recorded",
  !!tx,
  `amount=${tx?.amount}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);