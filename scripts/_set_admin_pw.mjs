import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const hash = await bcrypt.hash("khaidai1234", 10);
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/_set_admin_pw.mjs <email>");
  process.exit(1);
}
await prisma.user.update({
  where: { email },
  data: { password: hash },
});
console.log("reset password for", email);
await prisma.$disconnect();
