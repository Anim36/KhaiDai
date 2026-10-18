import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: a });

// Get partner user
const partnerUser = await p.user.findUnique({ where: { email: "partner-acceptance-extra@khaidai.test" } });
const partnerLogin = await fetch("http://localhost:3001/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "partner-acceptance-extra@khaidai.test", password: "khaidai1234", expectedRole: "PARTNER" }),
});
const partnerJ = await partnerLogin.json();
const partnerToken = partnerJ.token;
console.log("partner login:", partnerLogin.status);

const customerLogin = await fetch("http://localhost:3001/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "customer-acceptance-extra@khaidai.test", password: "khaidai1234", expectedRole: "CUSTOMER" }),
});
const customerJ = await customerLogin.json();
const customerToken = customerJ.token;

const restaurant = await p.restaurant.findFirst({ where: { ownerId: partnerUser.id } });
const menuItem = await p.menuItem.findFirst({ where: { restaurantId: restaurant.id } });

// Clean up any old notifs
await p.notification.deleteMany({ where: { type: "ORDER_UPDATE", title: "New delivery offer" } });

// Place a new order
const placed = await fetch("http://localhost:3001/api/orders", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
    deliveryAddress: "Manual Test Address",
    paymentMethod: "CASH",
    lat: 23.82,
    lng: 90.37,
  }),
});
const placedJ = await placed.json();
console.log("place:", placed.status, placedJ.order?.id, "riderId:", placedJ.order?.riderId);

const orderId = placedJ.order?.id;
await fetch(`http://localhost:3001/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ status: "preparing" }),
});
const ready = await fetch(`http://localhost:3001/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ status: "ready" }),
});
console.log("set ready:", ready.status, await ready.text());

// Wait 3s for dispatch to land
await new Promise(r => setTimeout(r, 3000));

// Check
const orderAfter = await p.order.findUnique({ where: { id: orderId } });
console.log("order.riderId:", orderAfter.riderId);

const riderUserId = orderAfter.riderId;
const notifs = await p.notification.findMany({ where: { userId: riderUserId } });
console.log("notifications for rider:", notifs.length);
console.log(JSON.stringify(notifs.slice(0, 3), null, 2));

await p.$disconnect();
