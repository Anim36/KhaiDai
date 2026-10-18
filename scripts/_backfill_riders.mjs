// Backfill the restored rider profiles to APPROVED so dispatch
// continues to work. Same logic as the original migration.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const r = await prisma.riderProfile.updateMany({
  where: { verificationStatus: "PENDING" },
  data: {
    verificationStatus: "APPROVED",
    verifiedAt: new Date(),
  },
});
console.log(`Updated ${r.count} rider profiles to APPROVED`);

const r2 = await prisma.restaurant.updateMany({
  where: { verificationStatus: "PENDING", deletedAt: null },
  data: {
    verificationStatus: "APPROVED",
    verifiedAt: new Date(),
  },
});
console.log(`Updated ${r2.count} restaurants to APPROVED`);

await prisma.$disconnect();