// scripts/set-customer-password.mjs — set the customer test user's
// password to a known bcrypt hash so the API can authenticate it.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const hash = await bcrypt.hash("Password1!", 10);
const updated = await prisma.user.update({
  where: { email: "customer-smoke@khaidai.test" },
  data: { password: hash },
});
console.log("Password reset for", updated.email);
await prisma.$disconnect();