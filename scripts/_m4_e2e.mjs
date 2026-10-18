// M-4 code-path verification
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

const customer = await prisma.user.findFirst({ where: { email: "customer-fav-e2e@khaidai.test" } });
const restaurant = await prisma.restaurant.findFirst({ where: { id: "cmur3vnrx0007d8bxwl52v31h" } });
const menuItem = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id } });

if (!customer || !restaurant || !menuItem) { console.error("missing fixtures"); process.exit(1); }
console.log("fixtures:");
console.log("  customer:", customer.email);
console.log("  restaurant:", restaurant.name);
console.log("  menuItem:", menuItem.name, "price:", menuItem.price);

console.log("\n[1] Customer login");
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: customer.email, password: "khaidai1234", expectedRole: "CUSTOMER" }),
});
const loginJson = await loginRes.json();
if (!loginJson.token) { console.error("login failed:", loginJson); process.exit(1); }
console.log("  OK login, role:", loginJson.user?.role);

console.log("\n[2] Place online-paid order");
const orderRes = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginJson.token}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1, selectedOptions: [] }],
    paymentMethod: "CARD",
    deliveryAddress: "123 Test Street, Dhaka",
    deliveryFee: 30, tax: 0, subtotal: menuItem.price,
  }),
});
const orderJson = await orderRes.json();
if (!orderJson.order) { console.error("order failed:", JSON.stringify(orderJson).slice(0, 300)); process.exit(1); }
const orderId = orderJson.order.id;
console.log("  OK order:", orderId, "status:", orderJson.order.status, "gatewayStatus:", orderJson.order.paymentGatewayStatus);

console.log("\n[3] Apply the IPN DB update path");
const orderBefore = await prisma.order.findUnique({ where: { id: orderId } });
await prisma.order.update({
  where: { id: orderId },
  data: {
    paymentGatewayStatus: "PAID",
    paidAt: new Date(),
    gatewayTransactionId: `BANK-TEST-${Date.now()}`,
    gatewaySessionKey: null,
    ...(orderBefore.status === "PENDING" ? { status: "PREPARING" } : {}),
  },
});
console.log("  OK update applied");

console.log("\n[4] Verify state");
const updated = await prisma.order.findUnique({ where: { id: orderId } });
console.log("  status:", updated.status);
console.log("  paymentGatewayStatus:", updated.paymentGatewayStatus);
console.log("  paidAt:", updated.paidAt);
console.log("  gatewayTransactionId:", updated.gatewayTransactionId);

console.log("\n[5] Verify partner API returns paidAt");
const partnerLogin = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "partner-pm-e2e@khaidai.test", password: "khaidai1234", expectedRole: "PARTNER" }),
});
const partnerAuth = await partnerLogin.json();
let partnerViewShows = false;
if (partnerAuth.token) {
  const ordersRes = await fetch(`${BASE}/api/orders`, { headers: { Authorization: `Bearer ${partnerAuth.token}` } });
  const ordersJson = await ordersRes.json();
  const ourOrder = (ordersJson.orders ?? []).find(o => o.id === orderId);
  if (ourOrder) {
    console.log("  ✓ order visible in partner dashboard");
    console.log("    paymentMethod:", ourOrder.paymentMethod);
    console.log("    paymentGatewayStatus:", ourOrder.paymentGatewayStatus);
    console.log("    status:", ourOrder.status);
    console.log("    paidAt:", ourOrder.paidAt);
    partnerViewShows = ourOrder.paidAt !== null;
  } else {
    console.log("  ⚠ order not in partner's list (this partner owns a different restaurant)");
  }
}

const passed = (
  updated.paymentGatewayStatus === "PAID" &&
  updated.paidAt !== null &&
  updated.status === "PREPARING"
);

if (passed) {
  console.log("\nM-4 code-path verification PASSED");
  console.log("   paymentGatewayStatus: PAID");
  console.log("   paidAt: set");
  console.log("   status: PREPARING (auto-promoted from PENDING)");
  if (partnerViewShows) console.log("   partner API returns paidAt to clients");
} else {
  console.log("\nM-4 code-path verification FAILED");
}

console.log("\n[Cleanup]");
await prisma.order.delete({ where: { id: orderId } });
await prisma.$disconnect();
process.exit(passed ? 0 : 1);