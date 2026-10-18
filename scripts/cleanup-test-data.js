/**
 * Clean up EmailOtp rows left behind by probe scripts. This is the
 * production concern: stale OTP rows can interfere with real user
 * signups if the row count grows large (no perf impact yet, but
 * messy). We only target rows tied to obviously-test emails — never
 * real Gmail addresses.
 *
 * Run with: node scripts/cleanup-test-data.js
 */
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

(async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Whitelist of test-email patterns used by ad-hoc probe scripts.
  // Real Gmail addresses (`@gmail.com`, `@uap-bd.edu`, etc.) are
  // NEVER touched — they belong to actual users.
  const TEST_PATTERNS = [
    "probe.happy.",
    "probe.stale.",
    "probe.wrong.",
    "probe.expired.",
    "probe.locked.",
    "rider.pw.",
    "rider.stale-ui.",
    "rider.regprobe.",
    // কাজ ১ + কাজ ২ — the two new regression scripts use these
    // disjoint prefixes. Whitelisting them keeps stale dot-throw
    // data from accumulating.
    "partner.regprobe.",
    "pwreset.probe.",
    // Feat 3 + Feat 5 — wallet + withdrawal e2e probes create
    // throw-away customer rows. Without a whitelist they would
    // accumulate (the prisma User cascade does not touch EmailOtp
    // when the user is hard-deleted, leaving stale OTP rows).
    "wallet.probe.",
    "withdraw.probe.",
  ];

  const result = await p.emailOtp.deleteMany({
    where: {
      OR: [
        { email: { endsWith: "@example.com" }, createdAt: { gte: since } },
        ...TEST_PATTERNS.map((p) => ({
          email: { startsWith: p },
          createdAt: { gte: since },
        })),
      ],
    },
  });
  console.log(`EmailOtp deleted: ${result.count}`);

  // Also delete the user rows these tests created. They only have
  // RiderProfiles — no Restaurant references — so the cascade is
  // safe. We identify them by the test-email pattern.
  const TEST_USER_PREFIXES = [
    "rider.pw.",
    "rider.stale-ui.",
    "rider.regprobe.",
    "partner.regprobe.",
    "partner.test.", // Bug 3 — leftover "Test Restaurant" owners.
    "pwreset.probe.",
    // Feat 3 + Feat 5 — wallet + withdrawal probes create
    // throw-away customer accounts. Cascade handles CustomerProfile
    // + Wallet, so we just need to whitelist for the User delete.
    "wallet.probe.",
    "withdraw.probe.",
  ];
  const testUsers = await p.user.findMany({
    where: {
      OR: TEST_USER_PREFIXES.map((p) => ({ email: { startsWith: p } })),
    },
    select: { id: true, email: true },
  });
  if (testUsers.length === 0) {
    console.log("no test users to clean");
  } else {
    const ids = testUsers.map((u) => u.id);
    const rp = await p.riderProfile.deleteMany({
      where: { userId: { in: ids } },
    });
    console.log(`  RiderProfile deleted: ${rp.count}`);
    const u = await p.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`  User deleted: ${u.count}`);
  }

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});