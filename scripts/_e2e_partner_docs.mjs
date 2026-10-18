// Bug 2 e2e: register a partner WITH 2 documents, verify the
// Restaurant + RestaurantDocument rows exist in the DB.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let pass = 0, fail = 0;
const log = (ok, msg) => {
  if (ok) { console.log("PASS  " + msg); pass++; }
  else { console.log("FAIL  " + msg); fail++; }
};

const probeEmail = `partner-bug2-${Date.now()}@example.com`;
const probePhone = `+88017${String(Date.now()).slice(-8)}`;
const otp = "123456";
const otpHash = createHash("sha256").update(otp).digest("hex");
await prisma.emailOtp.create({
  data: {
    email: probeEmail.toLowerCase(),
    otpHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "REGISTRATION",
  },
});

// Tiny 1x1 PNG (base64).
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const res = await fetch("http://localhost:4042/api/auth/register/partner", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Bug 2 Partner",
    email: probeEmail,
    password: "password123",
    phone: probePhone,
    otp,
    restaurant: {
      name: "Bug 2 Test Kitchen",
      address: "House 1, Road 1, Dhaka",
      cuisine: "bangladeshi",
    },
    documents: [
      {
        documentType: "TRADE_LICENSE",
        fileName: "license.png",
        fileUrl: tinyPng,
        mime: "image/png",
        size: 70,
      },
      {
        documentType: "OWNER_NID",
        fileName: "nid.png",
        fileUrl: tinyPng,
        mime: "image/png",
        size: 70,
      },
    ],
  }),
});

const text = await res.text();
console.log("STATUS:", res.status);
console.log("BODY:", text.slice(0, 250));
log(res.status === 201, "POST /api/auth/register/partner returns 201");

const body = JSON.parse(text);
const userId = body.user.id;
const restaurantId = body.restaurantId;
log(!!userId, "userId returned");
log(!!restaurantId, "restaurantId returned");

// Verify the restaurant row exists with PENDING.
const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
log(!!restaurant, "Restaurant row exists");
log(restaurant?.verificationStatus === "PENDING", "Restaurant verificationStatus=PENDING");
log(restaurant?.ownerId === userId, "Restaurant.ownerId === user.id");
log(restaurant?.cuisine === "bangladeshi", "Restaurant.cuisine preserved");
log(restaurant?.name === "Bug 2 Test Kitchen", "Restaurant.name preserved");

// Verify documents.
const docs = await prisma.restaurantDocument.findMany({
  where: { restaurantId },
  orderBy: { documentType: "asc" },
});
log(docs.length === 2, `RestaurantDocument count = 2 (got ${docs.length})`);
const types = docs.map((d) => d.documentType).sort();
log(JSON.stringify(types) === JSON.stringify(["OWNER_NID", "TRADE_LICENSE"]), `Document types match (got ${JSON.stringify(types)})`);
const tradeLicense = docs.find((d) => d.documentType === "TRADE_LICENSE");
log(tradeLicense?.fileUrl.startsWith("data:image/png;base64,"), "TRADE_LICENSE fileUrl is data URL");
log(tradeLicense?.fileUrl === tinyPng, "TRADE_LICENSE fileUrl matches input");

// Cleanup.
await prisma.restaurantDocument.deleteMany({ where: { restaurantId } });
await prisma.restaurant.delete({ where: { id: restaurantId } });
await prisma.partnerProfile.deleteMany({ where: { userId } });
await prisma.emailOtp.deleteMany({ where: { email: probeEmail.toLowerCase() } });
await prisma.user.delete({ where: { id: userId } });
await prisma.$disconnect();

console.log(`\nBug 2 e2e: ${pass} passed, ${failed} failed`.replace("{failed}", fail));
process.exit(fail === 0 ? 0 : 1);