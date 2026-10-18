/* eslint-disable */
// Test the partner register endpoint by hitting it with a real
// payload. Prints the server response + verifies DB rows.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const email = `partner.test.${Date.now()}@example.com`;
const phone = `+88017${Math.floor(10000000 + Math.random() * 89999999)}`;

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

(async () => {
  // Step 1: request OTP
  const otpRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, purpose: "REGISTRATION" }),
  });
  console.log("OTP request:", otpRes.status, await otpRes.text());

  // Step 2: read the OTP from DB (it was just written). In real
  // production we'd read it from the email; for tests we read it
  // straight from the database.
  const otpRow = await p.emailOtp.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  console.log("OTP row:", otpRow?.otpHash ? "(hash present)" : "(none)");
  if (!otpRow) {
    console.error("No OTP created — aborting");
    process.exit(1);
  }
  // We can't reverse the hash, so request another OTP and grep for
  // it via the email log… but the cleaner path is: write a tiny
  // helper that lets the test bypass the hash and call
  // verifyAndConsumeOtp directly. For now, just look at the most
  // recent code in the DB:
  // HACK: emails are logged to stdout in dev — try to extract the
  // last OTP for this email from console.log output. Easier path:
  // call the route with a known fixture OTP by writing it to DB.
  const fakeOtp = "000000";
  // Save fake OTP directly:
  await p.emailOtp.create({
    data: {
      email,
      otpHash: fakeOtp, // we're going to use a non-hashed path
      purpose: "REGISTRATION",
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  // We need the route to accept our fake OTP. The route hashes and
  // compares. So instead, let's create the OTP row with a SHA256
  // hash of "000000":
  await p.emailOtp.deleteMany({ where: { email } });
  const crypto = await import("node:crypto");
  const hash = crypto.createHash("sha256").update(fakeOtp).digest("hex");
  await p.emailOtp.create({
    data: {
      email,
      otpHash: hash,
      purpose: "REGISTRATION",
      expiresAt: new Date(Date.now() + 600000),
    },
  });

  // Step 3: register partner with documents
  const regRes = await fetch(`${BASE}/api/auth/register/partner`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Test Owner",
      email,
      password: "TestPassword123!",
      phone,
      otp: fakeOtp,
      restaurant: {
        name: "Test Restaurant",
        address: "123 Test St, Dhaka",
        cuisine: "bangladeshi",
      },
      documents: [
        {
          documentType: "TRADE_LICENSE",
          fileName: "license.png",
          fileUrl: tinyPng,
          mime: "image/png",
          size: 67,
        },
        {
          documentType: "OWNER_NID",
          fileName: "nid.png",
          fileUrl: tinyPng,
          mime: "image/png",
          size: 67,
        },
      ],
    }),
  });
  console.log("Register status:", regRes.status);
  console.log("Register body:", (await regRes.text()).slice(0, 400));

  // Step 4: verify DB
  const user = await p.user.findUnique({ where: { email } });
  console.log("User:", user?.id, user?.email);
  if (user) {
    const r = await p.restaurant.findFirst({
      where: { ownerId: user.id },
      include: { documents: true },
    });
    console.log(
      "Restaurant:",
      r?.id,
      "docs:",
      r?.documents.length,
      r?.documents.map((d) => d.documentType),
    );
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});