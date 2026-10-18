import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: a });
const bcrypt = await import("bcrypt");
const hash = await bcrypt.default.hash("khaidai1234", 12);
const u = await p.user.upsert({
  where: { email: "admin@khaidai.test" },
  update: { password: hash, role: "ADMIN" },
  create: { email: "admin@khaidai.test", name: "Test Admin", role: "ADMIN", password: hash },
});
console.log("admin:", u.id);
await p.$disconnect();
