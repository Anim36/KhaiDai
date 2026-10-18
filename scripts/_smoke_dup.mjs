// Smoke test for ধাপ ৩ — duplicate phone/email enforcement.
//
// We can't easily run the full HTTP flow (the API requires an OTP),
// so we verify the constraint layer directly via Prisma. Two
// assertions:
//   1. Inserting a duplicate phone into User raises P2002.
//   2. Inserting a duplicate email into User raises P2002.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let passed = 0, failed = 0;
const log = (ok, msg) => {
  if (ok) { console.log("PASS  " + msg); passed++; }
  else { console.log("FAIL  " + msg); failed++; }
};

// Pick a unique probe email + phone.
const probeEmail = `dup-test-${Date.now()}@example.com`;
const probePhone = `+88017${String(Date.now()).slice(-8)}`;

try {
  await prisma.user.create({
    data: {
      name: "Dup Probe",
      email: probeEmail,
      password: "x",
      phone: probePhone,
      role: "CUSTOMER",
    },
  });
  log(true, `created initial user with email=${probeEmail} phone=${probePhone}`);

  // Attempt duplicate phone.
  let phoneErr;
  try {
    await prisma.user.create({
      data: {
        name: "Dup Probe 2",
        email: `dup-test-2-${Date.now()}@example.com`,
        password: "x",
        phone: probePhone,
        role: "CUSTOMER",
      },
    });
  } catch (e) { phoneErr = e; }
  log(
    !!phoneErr && phoneErr.code === "P2002",
    `duplicate phone raises P2002 (got: ${phoneErr?.code ?? "no error"})`,
  );

  // Attempt duplicate email.
  let emailErr;
  try {
    await prisma.user.create({
      data: {
        name: "Dup Probe 3",
        email: probeEmail,
        password: "x",
        phone: `+88018${String(Date.now()).slice(-8)}`,
        role: "CUSTOMER",
      },
    });
  } catch (e) { emailErr = e; }
  log(
    !!emailErr && emailErr.code === "P2002",
    `duplicate email raises P2002 (got: ${emailErr?.code ?? "no error"})`,
  );
} finally {
  // Clean up.
  try {
    await prisma.user.deleteMany({
      where: { email: { startsWith: "dup-test" } },
    });
  } catch { /* ignore */ }
  await prisma.$disconnect();
}

console.log(`\nDUP SMOKE: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);