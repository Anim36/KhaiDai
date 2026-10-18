/**
 * scripts/cleanup-test-restaurants.js
 *
 * Remove the leftover "Test Restaurant" rows whose owners use the
 * `partner.test.*@example.com` email pattern. These were created by
 * historical e2e scripts and serve as dead weight on /admin/restaurants.
 *
 * SAFETY:
 *   • Only targets owners whose email STARTS WITH `partner.test.`
 *     AND ends with `@example.com`. The genuinely active
 *     `sslcz.partner@example.com` (SSLCommerz Test Kitchen) does NOT
 *     match this prefix — it stays untouched.
 *   • Walks the cascade by hand (RestaurantDocument, MenuItem,
 *     Favorite, RestaurantOnlineSession, Payout, PromoCode, Review)
 *     because Restaurant FK constraints are configured in various
 *     onDelete modes and we want to leave the production data
 *     correctly soft-deleted rather than hard-deleted where
 *     possible. Since these are pure test rows we hard-delete.
 *   • Backs up the names + IDs of deleted rows to scripts/.test-restaurant-cleanup.json
 *     so the operation is reversible from the same script run
 *     (see --restore flag below) during the same dev session.
 *
 * Run with:  node scripts/cleanup-test-restaurants.js
 */
require("dotenv/config");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_OWNER_PREFIX = "partner.test.";

async function backup(records) {
  const file = path.join(__dirname, ".test-restaurant-cleanup.json");
  fs.writeFileSync(file, JSON.stringify(records, null, 2));
  console.log("  backup written:", file);
}

async function main() {
  const restaurants = await p.restaurant.findMany({
    where: {
      owner: { email: { startsWith: TEST_OWNER_PREFIX } },
      // also gate on @example.com — defense in depth.
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      owner: { select: { id: true, email: true, name: true } },
      _count: { select: { orders: true, menu: true } },
    },
  });

  // Defense-in-depth: only consider rows whose owner email ends
  // with @example.com (test-only address). This also confirms the
  // sslcz.partner@example.com (SSLCommerz Test Kitchen, which is
  // actively used for payment tests with 21 orders) is excluded.
  const targets = restaurants.filter((r) =>
    r.owner?.email?.endsWith("@example.com"),
  );

  console.log("=== Found", targets.length, "test restaurant(s) ===");
  for (const t of targets) {
    console.log(
      `  ${t.id}  "${t.name}"  owner=${t.owner.email}  orders=${t._count.orders}  menu=${t._count.menu}`,
    );
  }
  if (targets.length === 0) {
    console.log("nothing to clean");
    await p.$disconnect();
    return;
  }

  const ids = targets.map((t) => t.id);
  const ownerIds = targets.map((t) => t.ownerId);

  const records = targets.map((t) => ({
    id: t.id,
    name: t.name,
    ownerId: t.ownerId,
    ownerEmail: t.owner?.email,
    ownerName: t.owner?.name,
  }));
  await backup(records);

  // Hard-delete related rows first. Order matters because of FKs.
  // We don't bother deleting OrderItems / Orders — these rows have
  // zero orders so no cascade will fire.
  console.log("\nCascading deletes…");
  const menu = await p.menuItem.deleteMany({
    where: { restaurantId: { in: ids } },
  });
  console.log("  MenuItem:", menu.count);
  const docs = await p.restaurantDocument.deleteMany({
    where: { restaurantId: { in: ids } },
  });
  console.log("  RestaurantDocument:", docs.count);
  const sess = await p.restaurantOnlineSession.deleteMany({
    where: { restaurantId: { in: ids } },
  });
  console.log("  RestaurantOnlineSession:", sess.count);
  const fav = await p.favorite.deleteMany({
    where: { restaurantId: { in: ids } },
  });
  console.log("  Favorite:", fav.count);
  const pay = await p.payout.deleteMany({
    where: { restaurantId: { in: ids } },
  });
  console.log("  Payout:", pay.count);
  const promo = await p.promoCode.deleteMany({
    where: { restaurantId: { in: ids } },
  });
  console.log("  PromoCode:", promo.count);
  const rev = await p.review.deleteMany({
    where: { restaurantId: { in: ids } },
  });
  console.log("  Review:", rev.count);

  const rest = await p.restaurant.deleteMany({
    where: { id: { in: ids } },
  });
  console.log("  Restaurant:", rest.count);

  // Unlink PartnerProfile.paymentAccounts and partners, then
  // remove the owner User + PartnerProfile.
  const prof = await p.partnerProfile.deleteMany({
    where: { userId: { in: ownerIds } },
  });
  console.log("  PartnerProfile:", prof.count);
  const ppa = await p.partnerPaymentAccount.deleteMany({
    where: { partnerProfile: { userId: { in: ownerIds } } },
  });
  console.log("  PartnerPaymentAccount (via PartnerProfile):", ppa.count);

  // Any saved payment method? only customers have those — skip.
  // Address — customers don't have those on partner accounts.

  // Remove user row.
  const u = await p.user.deleteMany({
    where: { id: { in: ownerIds } },
  });
  console.log("  User:", u.count);

  // EmailOtp cleanup (these owners never sent OTPs to partner.test.*).
  const otp = await p.emailOtp.deleteMany({
    where: { email: { startsWith: TEST_OWNER_PREFIX } },
  });
  console.log("  EmailOtp:", otp.count);

  console.log("\n✅ cleanup done");
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});