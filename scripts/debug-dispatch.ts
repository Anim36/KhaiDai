/* eslint-disable */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pickNextRider } from "../lib/dispatch";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });

(async () => {
  const r = await p.riderProfile.findFirst({
    where: { isOnline: true, verificationStatus: "APPROVED" },
  });
  const rest = await p.restaurant.findFirst({
    where: { latitude: { not: null }, longitude: { not: null } },
  });
  console.log("Rider:", r?.userId, "lat/lng:", r?.currentLat, r?.currentLng);
  console.log(
    "Rider zone:",
    r?.zoneLat,
    r?.zoneLng,
    "radius:",
    r?.zoneRadiusKm,
  );
  console.log(
    "Restaurant:",
    rest?.name,
    "lat/lng:",
    rest?.latitude,
    rest?.longitude,
  );
  if (r?.currentLat && r?.currentLng && rest?.latitude && rest?.longitude) {
    const pick = await pickNextRider(
      rest.latitude,
      rest.longitude,
      [],
    );
    console.log("Pick result:", pick);
  }
  await p.$disconnect();
})();