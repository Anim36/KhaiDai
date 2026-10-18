// Full end-to-end rider repro simulating the CLIENT submit:
//   1. Mint EmailOtp
//   2. Verify it
//   3. Confirm a clean POST /api/auth/register/rider works
//   4. Then try a POST WITHOUT prior OTP verify → expect 400 "No active code..."
//   5. Then try a POST with stale OTP → expect 400 "Code expired"
//
// This isolates the EXACT failure mode the user is seeing.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function mintOtp(email, otp = "123456") {
  const otpHash = createHash("sha256").update(otp).digest("hex");
  return prisma.emailOtp.create({
    data: { email, otpHash, expiresAt: new Date(Date.now() + 600_000), purpose: "REGISTRATION" },
  });
}

async function runCase(name, bodyFactory) {
  const probeEmail = `rider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const probePhone = `+88017${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)}`;
  console.log(`\n=== ${name} ===`);
  console.log(`email=${probeEmail} phone=${probePhone}`);
  await bodyFactory(probeEmail, probePhone);
  try {
    const res = await fetch("http://localhost:3838/api/auth/register/rider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await bodyFactory(probeEmail, probePhone)),
    });
    const text = await res.text();
    console.log(`STATUS: ${res.status}`);
    console.log(`BODY: ${text.slice(0, 250)}`);
  } catch (err) {
    console.error("FETCH ERROR:", err.message);
  }
  await prisma.emailOtp.deleteMany({ where: { email: probeEmail } });
  await prisma.user.deleteMany({ where: { email: probeEmail } });
}

// Case A — fresh OTP + good payload → 201
await runCase("fresh OTP, good payload", async (email, phone) => ({
  name: "Repro A",
  email, password: "password123", phone,
  vehicleType: "bike", vehicleRegNumber: "DHA-1234",
  otp: await mintOtp(email).then(() => "123456"),
}));

// Case B — no OTP row in DB → 400 "No active code"
await runCase("no OTP row, payload submitted", async (email, phone) => ({
  name: "Repro B", email, password: "password123", phone,
  vehicleType: "bike", vehicleRegNumber: "DHA-1234",
  otp: "123456",
}));

// Case C — already-consumed OTP → 400 "No active code"
await runCase("OTP consumed already", async (email, phone) => {
  const r = await mintOtp(email);
  // Consume manually.
  await prisma.emailOtp.update({
    where: { id: r.id },
    data: { consumedAt: new Date() },
  });
  return {
    name: "Repro C", email, password: "password123", phone,
    vehicleType: "bike", vehicleRegNumber: "DHA-1234",
    otp: "123456",
  };
});

// Case D — expired OTP (expiresAt in the past) → 400 "Code expired"
await runCase("OTP expired", async (email, phone) => {
  await prisma.emailOtp.create({
    data: {
      email,
      otpHash: createHash("sha256").update("123456").digest("hex"),
      expiresAt: new Date(Date.now() - 1000),
      purpose: "REGISTRATION",
    },
  });
  return {
    name: "Repro D", email, password: "password123", phone,
    vehicleType: "bike", vehicleRegNumber: "DHA-1234",
    otp: "123456",
  };
});

// Case E — wrong OTP → 400 "Incorrect code"
await runCase("OTP hash mismatch", async (email, phone) => {
  await mintOtp(email, "111111");
  return {
    name: "Repro E", email, password: "password123", phone,
    vehicleType: "bike", vehicleRegNumber: "DHA-1234",
    otp: "222222", // wrong!
  };
});

await prisma.$disconnect();