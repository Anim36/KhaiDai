import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const hash = await bcrypt.hash("khaidai1234", 10);
const emails = [
  "customer-smoke@khaidai.test",
  "spice175318@khaidai.test",
  "rahim.smoke@example.com",
  "rahim.smoke+18074@example.com",
];
for (const email of emails) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    console.log("MISSING", email);
    continue;
  }
  await prisma.user.update({ where: { email }, data: { password: hash } });
  console.log("password reset for", email);
}
await prisma.$disconnect();
