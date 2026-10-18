import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const pendings = await prisma.restaurant.findMany({
  where: { verificationStatus: "PENDING", deletedAt: null },
  include: { owner: true },
});
console.log("Pending restaurants:", pendings.length);
for (const r of pendings) {
  console.log(`- id=${r.id} name=${r.name} ownerEmail=${r.owner.email}`);
  await prisma.restaurantDocument.deleteMany({ where: { restaurantId: r.id } });
  await prisma.restaurant.delete({ where: { id: r.id } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: r.owner.email } },
  });
  console.log("  cleaned");
}
await prisma.$disconnect();