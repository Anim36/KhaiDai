// scripts/backfill-referral-codes.ts
//
// One-shot migration: every User row that was created before
// the `User.referralCode` column existed (or that signed up
// before the registration route started auto-generating codes)
// gets a unique code stamped. Idempotent — re-running on an
// already-populated database is a no-op (we only touch users
// where `referralCode IS NULL`).
//
// Run: `npx tsx scripts/backfill-referral-codes.ts` (the dev
// server can keep running; we only write to the User table
// and never touch Wallet / Order / Referral rows).

import { prisma } from "../lib/prisma";
import { generateUniqueReferralCode } from "../lib/referral";

async function main() {
  const totalMissing = await prisma.user.count({
    where: { referralCode: null },
  });
  console.log(`Users without a referralCode: ${totalMissing}`);
  if (totalMissing === 0) {
    console.log("Nothing to do — every user already has a code.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  // Stream the rows so a 100k-user table doesn't OOM. We can't
  // update a row inside a streaming findMany() cursor, so we
  // paginate manually.
  const PAGE = 200;
  for (let skip = 0; skip < totalMissing; skip += PAGE) {
    const batch = await prisma.user.findMany({
      where: { referralCode: null },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
      take: PAGE,
      skip,
    });
    for (const u of batch) {
      try {
        const code = await generateUniqueReferralCode(prisma);
        await prisma.user.update({
          where: { id: u.id },
          data: { referralCode: code },
        });
        updated++;
        if (updated % 25 === 0) {
          console.log(`  ${updated}/${totalMissing} updated`);
        }
      } catch (e) {
        skipped++;
        console.warn(`  skip ${u.email}: ${(e as Error).message ?? e}`);
      }
    }
  }

  console.log(`Done — updated=${updated} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
