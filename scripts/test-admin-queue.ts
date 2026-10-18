/* eslint-disable */
// Hit GET /api/admin/verifications and ensure the documents we
// just created come back with fileUrl populated.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });
const BASE = process.env.TEST_BASE ?? "http://localhost:3000";

(async () => {
  // Find an admin user and mint a JWT directly (mirrors how
  // admin-shell auth works).
  const admin = await p.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.log("No admin user in DB — skipping.");
    process.exit(0);
  }
  const jwt = (
    await import("jsonwebtoken")
  ).default.sign({ sub: admin.id, role: "ADMIN" }, process.env.JWT_SECRET!);

  for (const type of ["restaurant", "rider"]) {
    const res = await fetch(
      `${BASE}/api/admin/verifications?type=${type}&status=PENDING`,
      { headers: { authorization: `Bearer ${jwt}` } },
    );
    console.log("status:", res.status, "type:", type);
    const json = await res.json();
    console.log("rows:", json.restaurants?.length ?? json.riders?.length);
    const sample = (json.restaurants ?? json.riders ?? [])[0];
    if (sample) {
      console.log("sample id:", sample.id, "docs:", sample.documents?.length);
      if (sample.documents?.length > 0) {
        console.log(
          "first doc type:",
          sample.documents[0].documentType,
          "fileUrl len:",
          sample.documents[0].fileUrl?.length,
        );
      }
    }
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});