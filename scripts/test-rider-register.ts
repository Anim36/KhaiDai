/* eslint-disable */
// Smoke-test the rider register endpoint: hits POST
// /api/auth/register/rider with a documents array and verifies the
// RiderDocument row is created.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });
const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const email = `rider.test.${Date.now()}@example.com`;
const phone = `+88018${Math.floor(10000000 + Math.random() * 89999999)}`;
const fakeOtp = "000000";
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

(async () => {
  // Bootstrap an OTP row directly in the DB (the dev server logs
  // them to stdout but it's faster to insert).
  await p.emailOtp.deleteMany({ where: { email } });
  await p.emailOtp.create({
    data: {
      email,
      otpHash: createHash("sha256").update(fakeOtp).digest("hex"),
      purpose: "REGISTRATION",
      expiresAt: new Date(Date.now() + 600000),
    },
  });

  const regRes = await fetch(`${BASE}/api/auth/register/rider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Test Rider",
      email,
      password: "TestPassword123!",
      phone,
      vehicleType: "bike",
      vehicleRegNumber: "DM-T-1234",
      otp: fakeOtp,
      documents: [
        {
          documentType: "DRIVING_LICENSE",
          fileName: "license.png",
          fileUrl: tinyPng,
          mime: "image/png",
          size: 67,
        },
      ],
    }),
  });
  console.log("Register status:", regRes.status);
  console.log("Register body:", (await regRes.text()).slice(0, 400));

  const user = await p.user.findUnique({ where: { email } });
  console.log("User:", user?.id, user?.email);
  if (user) {
    const r = await p.riderProfile.findFirst({
      where: { userId: user.id },
      include: { documents: true },
    });
    console.log(
      "RiderProfile:",
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