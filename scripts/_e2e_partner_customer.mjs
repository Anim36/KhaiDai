// E2E for the customer and partner register endpoints. Confirms
// the restructured client payload (which now sends every field
// once at the final step) reaches the server intact and produces
// the expected rows in the DB.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let passed = 0, failed = 0;
const log = (ok, msg) => {
  if (ok) { console.log("PASS  " + msg); passed++; }
  else { console.log("FAIL  " + msg); failed++; }
};

async function mintOtp(email) {
  const otp = "123456";
  const otpHash = createHash("sha256").update(otp).digest("hex");
  await prisma.emailOtp.create({
    data: {
      email: email.toLowerCase(),
      otpHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose: "REGISTRATION",
    },
  });
  return otp;
}

// CUSTOMER
{
  const email = `customer-e2e-${Date.now()}@example.com`;
  const phone = `+88017${String(Date.now()).slice(-8)}`;
  const otp = await mintOtp(email);
  console.log(`\n=== CUSTOMER email=${email} phone=${phone}`);
  const payload = {
    name: "E2E Customer",
    email,
    password: "password123",
    phone,
    role: "CUSTOMER",
    otp,
  };
  const res = await fetch("http://localhost:3939/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`STATUS: ${res.status}`);
  console.log(`BODY: ${text.slice(0, 200)}`);
  log(res.status === 201, `customer POST returns 201`);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  log(!!user, "customer User row exists");
  log(user?.role === "CUSTOMER", "customer role === CUSTOMER");
  const profile = await prisma.customerProfile.findUnique({
    where: { userId: user?.id ?? "_none_" },
  });
  log(!!profile, "customer CustomerProfile row exists");
  // Cleanup
  await prisma.emailOtp.deleteMany({ where: { email: email.toLowerCase() } });
  await prisma.customerProfile.deleteMany({ where: { userId: user?.id } });
  await prisma.user.deleteMany({ where: { email: email.toLowerCase() } });
}

// PARTNER
{
  const email = `partner-e2e-${Date.now()}@example.com`;
  const phone = `+88017${String(Date.now()).slice(-8)}`;
  const otp = await mintOtp(email);
  console.log(`\n=== PARTNER email=${email} phone=${phone}`);
  const payload = {
    name: "E2E Partner",
    email,
    password: "password123",
    phone,
    role: "PARTNER",
    otp,
  };
  const res = await fetch("http://localhost:3939/api/auth/register/partner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`STATUS: ${res.status}`);
  console.log(`BODY: ${text.slice(0, 200)}`);
  log(res.status === 201, `partner POST returns 201`);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  log(!!user, "partner User row exists");
  log(user?.role === "PARTNER", "partner role === PARTNER");
  const profile = await prisma.partnerProfile.findUnique({
    where: { userId: user?.id ?? "_none_" },
  });
  log(!!profile, "partner PartnerProfile row exists");
  // Cleanup
  await prisma.emailOtp.deleteMany({ where: { email: email.toLowerCase() } });
  await prisma.partnerProfile.deleteMany({ where: { userId: user?.id } });
  await prisma.user.deleteMany({ where: { email: email.toLowerCase() } });
}

await prisma.$disconnect();
console.log(`\nE2E CUSTOMER+PARTNER: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);