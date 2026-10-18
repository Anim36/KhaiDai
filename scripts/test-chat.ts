/* eslint-disable */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import jwt from "jsonwebtoken";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });
const BASE = process.env.TEST_BASE ?? "http://localhost:3000";

(async () => {
  // Find an order in PICKED_UP state (or create one).
  let order = await p.order.findFirst({
    where: { status: "PICKED_UP" },
    select: { id: true, customerId: true, riderId: true, status: true },
  });

  if (!order) {
    const r = await p.restaurant.findFirst({
      where: { latitude: { not: null } },
    });
    const cust = await p.user.create({
      data: {
        email: `chat-cust-${Date.now()}@example.com`,
        name: "Chat Cust",
        password: "x",
        role: "CUSTOMER",
        customerProfile: { create: {} },
      },
    });
    const rider = await p.user.findFirst({
      where: { role: "RIDER" },
    });
    if (!r || !rider || !r.latitude) {
      console.log("No restaurant / rider to use — skipping");
      process.exit(0);
    }
    order = await p.order.create({
      data: {
        restaurantId: r.id,
        customerId: cust.id,
        riderId: rider.id,
        status: "PICKED_UP",
        subtotal: 100,
        deliveryFee: 50,
        total: 150,
        riderEarning: 12,
        deliveryAddress: "Test",
        paymentMethod: "CASH",
      },
      select: { id: true, customerId: true, riderId: true, status: true },
    });
  }

  if (!order.riderId) {
    console.log("No rider on order — skipping");
    process.exit(0);
  }
  console.log("Order:", order.id, "status:", order.status);

  // Mint JWTs for customer + rider
  const custToken = jwt.sign(
    { sub: order.customerId, role: "CUSTOMER" },
    process.env.JWT_SECRET!,
  );
  const riderToken = jwt.sign(
    { sub: order.riderId, role: "RIDER" },
    process.env.JWT_SECRET!,
  );

  // 1. POST a message as customer
  const post1 = await fetch(`${BASE}/api/orders/${order.id}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${custToken}`,
    },
    body: JSON.stringify({ message: "Hi rider!" }),
  });
  console.log("Customer POST:", post1.status, await post1.text());

  // 2. POST a message as rider
  const post2 = await fetch(`${BASE}/api/orders/${order.id}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${riderToken}`,
    },
    body: JSON.stringify({ message: "On my way!" }),
  });
  console.log("Rider POST:", post2.status, await post2.text());

  // 3. GET history as customer
  const get1 = await fetch(`${BASE}/api/orders/${order.id}/messages`, {
    headers: { authorization: `Bearer ${custToken}` },
  });
  const data = await get1.json();
  console.log(
    "Customer GET:",
    get1.status,
    "messages:",
    data.messages?.length,
    "chatEnabled:",
    data.chatEnabled,
  );
  console.log("Sample:", data.messages?.slice(0, 2));

  // 4. Verify status gate: try posting to an order NOT in PICKED_UP
  const order2 = await p.order.create({
    data: {
      restaurantId: (await p.restaurant.findFirst())!.id,
      customerId: order.customerId,
      riderId: order.riderId,
      status: "OFFERED_TO_RIDER",
      subtotal: 100,
      deliveryFee: 50,
      total: 150,
      deliveryAddress: "Test",
      paymentMethod: "CASH",
    },
  });
  const post3 = await fetch(`${BASE}/api/orders/${order2.id}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${custToken}`,
    },
    body: JSON.stringify({ message: "should be blocked" }),
  });
  console.log("Pre-pickup POST:", post3.status, await post3.text());

  // 5. Verify auth: a third party can't read
  const stranger = await p.user.create({
    data: {
      email: `chat-stranger-${Date.now()}@example.com`,
      name: "Stranger",
      password: "x",
      role: "CUSTOMER",
      customerProfile: { create: {} },
    },
  });
  const strangerToken = jwt.sign(
    { sub: stranger.id, role: "CUSTOMER" },
    process.env.JWT_SECRET!,
  );
  const get3 = await fetch(`${BASE}/api/orders/${order.id}/messages`, {
    headers: { authorization: `Bearer ${strangerToken}` },
  });
  console.log("Stranger GET:", get3.status);

  // Cleanup
  await p.orderMessage.deleteMany({ where: { orderId: order.id } });
  await p.order.delete({ where: { id: order2.id } });
  await p.user.delete({ where: { id: stranger.id } });
  if (order.customerId !== custToken) {
    // we didn't create this customer
  }

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});