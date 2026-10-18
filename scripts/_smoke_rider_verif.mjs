// Smoke test for ধাপ ৫ — rider verification status propagation.
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

try {
  const pendingCount = await prisma.riderProfile.count({
    where: { verificationStatus: "PENDING" },
  });
  log(
    pendingCount === 0,
    `no rider is still PENDING after backfill (count=${pendingCount})`,
  );

  const probeUser = await prisma.user.create({
    data: {
      name: `Rider Smoke ${Date.now()}`,
      email: `rider-smoke-${Date.now()}@example.com`,
      password: "x",
      role: "RIDER",
    },
  });
  const probe = await prisma.riderProfile.create({
    data: {
      userId: probeUser.id,
      vehicleType: "bike",
    },
  });
  log(
    probe.verificationStatus === "PENDING",
    `newly-created RiderProfile defaults to PENDING (got ${probe.verificationStatus})`,
  );

  // Dispatch eligibility: PENDING rider excluded.
  const eligible = await prisma.riderProfile.findMany({
    where: {
      isOnline: true,
      verificationStatus: "APPROVED",
      currentLat: { not: null },
      currentLng: { not: null },
      zoneLat: { not: null },
      zoneLng: { not: null },
    },
    select: { id: true },
  });
  const probeEligible = eligible.some((r) => r.id === probe.id);
  log(
    !probeEligible,
    `PENDING rider excluded from dispatch eligibility filter`,
  );

  // Document upload + replace.
  const doc1 = await prisma.riderDocument.create({
    data: {
      riderProfileId: probe.id,
      documentType: "NID",
      fileUrl: "data:image/png;base64,xxx",
    },
  });
  log(!!doc1.id, "RiderDocument row created");

  await prisma.riderDocument.deleteMany({
    where: { riderProfileId: probe.id, documentType: "NID" },
  });
  const remaining = await prisma.riderDocument.count({
    where: { riderProfileId: probe.id, documentType: "NID" },
  });
  log(remaining === 0, "deleteMany before re-upload works");

  // Cleanup.
  await prisma.riderDocument.deleteMany({ where: { riderProfileId: probe.id } });
  await prisma.riderProfile.delete({ where: { id: probe.id } });
  await prisma.user.delete({ where: { id: probeUser.id } });
} catch (err) {
  console.error("ERROR:", err.message);
  failed++;
} finally {
  await prisma.$disconnect();
}

console.log(`\nRIDER VERIF SMOKE: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);