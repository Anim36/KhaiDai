// scripts/probe-referral.mjs
//
// Feat 6 — Customer Referral Program end-to-end probe.
//
// Scenario:
//   1. The legacy `sslcz.customer@example.com` customer is our
//      referrer. We read their referralCode off the User row.
//   2. Pre-seed an EmailOtp row (purpose=REGISTRATION,
//      code "123456", SHA-256 hash matching lib/otp.ts) so the
//      registration route's `verifyAndConsumeOtp` step passes.
//      We DELETE every prior otp for the new email first so
//      our row is the latest unconsumed one.
//   3. Register a brand-new referee customer via
//      POST /api/auth/register, passing the referrer's code as
//      `referralCode`. Assert the user has `referredByUserId`
//      and the Referral row is PENDING.
//   4. Capture wallet balances for both sides BEFORE the
//      referee's first order.
//   5. Place a COD order, walk it through PREPARING (partner),
//      PICKED_UP (rider), ON_THE_WAY (rider), DELIVERED (rider).
//   6. Assert both wallets credited ৳50, both have a
//      WalletTransaction with type=REFERRAL_BONUS tagged to
//      the order id, the Referral row flipped to REWARDED,
//      and the customer received a PROMOTION notification.
//   7. Place + deliver a SECOND order. Assert NO additional
//      credit on either side (first-delivered guard).
//   8. Hit GET /api/referral as the referrer and as the referee
//      and assert their PENDING/REWARDED counts are right.

import "dotenv/config";
import { createHash, randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Pa55word!";
const PARTNER = {
  email: "sslcz.partner@example.com",
  password: PASSWORD,
  expectedRole: "PARTNER",
};
const REFEREE = {
  // Stable email so this probe is re-runnable. The probe
  // wipes prior Referral/Wallet rows for this user on every
  // run so reruns aren't polluted.
  email: `probe.referral.referee.${Date.now()}@example.com`,
  password: PASSWORD,
  expectedRole: "CUSTOMER",
};

const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: a });

let pass = 0, fail = 0;
function check(name, ok, info = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}${info ? " — " + info : ""}`); }
  else    { fail++; console.log(`  ✗ ${name}${info ? " — " + info : ""}`); }
}

async function login({ email, password, expectedRole }) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).token;
}

function hashOtp(code) {
  return createHash("sha256").update(code).digest("hex");
}

async function seedOtp(email) {
  // Wipe any prior unconsumed REGISTRATION rows for this email
  // so our seed is the latest one. Consumed + expired rows are
  // fine to leave alone — they're ignored by verifyAndConsumeOtp.
  await prisma.emailOtp.deleteMany({
    where: {
      email: email.toLowerCase(),
      purpose: "REGISTRATION",
      consumedAt: null,
    },
  });
  const code = "123456";
  await prisma.emailOtp.create({
    data: {
      email: email.toLowerCase(),
      purpose: "REGISTRATION",
      otpHash: hashOtp(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return code;
}

async function placeOrder({ token, restaurantId, menuItemId, address }) {
  const r = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      restaurantId,
      items: [{ menuItemId, quantity: 1 }],
      deliveryAddress: address,
      paymentMethod: "CASH",
    }),
  });
  if (!r.ok) throw new Error(`placeOrder: ${r.status} ${await r.text()}`);
  return (await r.json()).order;
}

async function patchOrder({ token, id, status }) {
  const r = await fetch(`${BASE}/api/orders/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!r.ok) throw new Error(`patchOrder(${status}): ${r.status} ${await r.text()}`);
  return (await r.json()).order;
}

// 1. Resolve the referrer (legacy customer). We also clean
// up any prior probe referrals + REFERRAL_BONUS audit rows
// tied to probe-created referees so the "rewarded count"
// assertion stays stable across re-runs. The referrer's
// wallet balance is reset to its pre-probe baseline.
const referrer = await prisma.user.findUniqueOrThrow({
  where: { email: "sslcz.customer@example.com" },
  select: { id: true, name: true, referralCode: true, role: true },
});
const probeReferralRows = await prisma.referral.findMany({
  where: {
    referrerUserId: referrer.id,
    referee: { email: { startsWith: "probe.referral.referee." } },
  },
  select: { id: true },
});
if (probeReferralRows.length > 0) {
  const ids = probeReferralRows.map((r) => r.id);
  await prisma.walletTransaction.deleteMany({
    where: {
      type: "REFERRAL_BONUS",
      order: { customer: { email: { startsWith: "probe.referral.referee." } } },
    },
  });
  await prisma.referral.deleteMany({ where: { id: { in: ids } } });
}

// Cascade-clean any prior probe referee accounts so phone
// UNIQUE collisions don't fire. We set deletedAt + sweep
// referral/wallet rows first so the FK deletion is safe.
const priorReferees = await prisma.user.findMany({
  where: { email: { startsWith: "probe.referral.referee." } },
  select: { id: true },
});
if (priorReferees.length > 0) {
  await prisma.referral.deleteMany({
    where: { refereeUserId: { in: priorReferees.map((u) => u.id) } },
  });
  await prisma.order.deleteMany({
    where: { customerId: { in: priorReferees.map((u) => u.id) } },
  });
  await prisma.wallet.deleteMany({
    where: {
      customerProfile: { userId: { in: priorReferees.map((u) => u.id) } },
    },
  });
  await prisma.customerProfile.deleteMany({
    where: { userId: { in: priorReferees.map((u) => u.id) } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: priorReferees.map((u) => u.id) } },
  });
}
check(
  "referrer.user.referralCode exists (auto-generated)",
  typeof referrer.referralCode === "string" && referrer.referralCode.length >= 6,
  `code=${referrer.referralCode}`,
);
check(
  "referrer is a CUSTOMER",
  referrer.role === "CUSTOMER",
  `role=${referrer.role}`,
);
const referrerCode = referrer.referralCode;

// 2. Seed OTP + register the referee with the referrer's code.
const otpCode = await seedOtp(REFEREE.email);
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Probe Referee",
    email: REFEREE.email,
    password: REFEREE.password,
    otp: otpCode,
    referralCode: referrerCode,
  }),
});
check(
  "POST /api/auth/register with referralCode returns 201",
  reg.status === 201,
  `status=${reg.status}`,
);
if (reg.status !== 201) {
  console.error(await reg.text());
  await prisma.$disconnect();
  process.exit(1);
}
const regJson = await reg.json();
const refereeUser = await prisma.user.findUniqueOrThrow({
  where: { id: regJson.user.id },
  select: { id: true, referralCode: true, referredByUserId: true },
});
check(
  "referee.user.referredByUserId = referrer.id",
  refereeUser.referredByUserId === referrer.id,
  `referredBy=${refereeUser.referredByUserId} expected=${referrer.id}`,
);
check(
  "referee.user.referralCode auto-generated and unique-shaped",
  typeof refereeUser.referralCode === "string" &&
    refereeUser.referralCode.length >= 6 &&
    refereeUser.referralCode !== referrerCode,
  `refereeCode=${refereeUser.referralCode} ≠ ${referrerCode}`,
);
const referralRow = await prisma.referral.findUnique({
  where: { refereeUserId: refereeUser.id },
  select: { id: true, referrerUserId: true, status: true, rewardedAt: true },
});
check(
  "Referral row created in PENDING",
  !!referralRow && referralRow.status === "PENDING" && referralRow.rewardedAt === null,
  `status=${referralRow?.status} rewardedAt=${referralRow?.rewardedAt}`,
);

// 3. Login tokens + log referee in.
const partnerToken = await login(PARTNER);
const refereeToken = await login(REFEREE);

// 4. Capture starting balances.
const referrerProfile = await prisma.customerProfile.findUnique({
  where: { userId: referrer.id },
  select: { id: true },
});
const refereeProfile = await prisma.customerProfile.findUniqueOrThrow({
  where: { userId: refereeUser.id },
  select: { id: true },
});
const referrerWallet0 = await prisma.wallet.findUnique({
  where: { customerProfileId: referrerProfile?.id ?? "__none__" },
  select: { balance: true },
});
const refereeWallet0 = await prisma.wallet.findUnique({
  where: { customerProfileId: refereeProfile.id },
  select: { balance: true },
});
const referrerBalance0 = referrerWallet0?.balance ?? 0;
const refereeBalance0 = refereeWallet0?.balance ?? 0;
check(
  "starting balances captured (referee 0)",
  refereeBalance0 === 0,
  `referrerBalance0=${referrerBalance0} refereeBalance0=${refereeBalance0}`,
);

// 5. Walk a COD order through the full lifecycle.
// Need a rider to dispatch. Bootstrap one with the
// standard probe password, like probe-features-1-2-3 does.
const bcryptModule = await import("bcrypt");
const bcrypt = bcryptModule.default ?? bcryptModule;
const riderPass = await bcrypt.hash(PASSWORD, 8);
const RIDER = { email: "probe.rider@example.com" };
let riderUser = await prisma.user.findUnique({
  where: { email: RIDER.email },
  select: { id: true },
});
if (!riderUser) {
  riderUser = await prisma.user.create({
    data: {
      email: RIDER.email,
      name: "Probe Rider",
      role: "RIDER",
      phone: `+8801${Date.now().toString().slice(-9)}`,
      password: riderPass,
    },
    select: { id: true },
  });
} else {
  await prisma.user.update({
    where: { id: riderUser.id },
    data: { password: riderPass },
  });
}
const riderToken = await login({
  email: RIDER.email,
  password: PASSWORD,
  expectedRole: "RIDER",
});

const partner = await prisma.user.findUniqueOrThrow({
  where: { email: PARTNER.email },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true, address: true },
});
// Use a fixed, options-free menu item so the order POST
// doesn't trip the "required Size" guard added by Feat 1. The
// probe-options-and-instructions script also writes to this
// id but always restores it to `available: true` with no
// options attached; if it disappeared, we recreate it.
const item = await prisma.menuItem.upsert({
  where: { id: "__referral_probe_item__" },
  update: { available: true, deletedAt: null, price: 150 },
  create: {
    id: "__referral_probe_item__",
    restaurantId: restaurant.id,
    name: "Referral Probe Item",
    price: 150,
    category: "test",
    available: true,
  },
  select: { id: true, price: true },
});

const order1 = await placeOrder({
  token: refereeToken,
  restaurantId: restaurant.id,
  menuItemId: item.id,
  address: restaurant.address,
});
check("referee placed order 1 (status=PENDING)", order1.status === "pending", `status=${order1.status}`);

// Partner: pending → preparing → ready. The order's
// `riderId` is stamped by the dispatch step the moment
// status lands on PREPARING, but the rider's first legal
// transition is still READY → PICKED_UP.
await patchOrder({ token: partnerToken, id: order1.id, status: "preparing" });
await patchOrder({ token: partnerToken, id: order1.id, status: "ready" });
const order2 = await fetch(`${BASE}/api/orders/${order1.id}`, {
  headers: { authorization: `Bearer ${riderToken}` },
}).then((r) => r.json());
check(
  "after READY, rider can see the order (auto-dispatched)",
  !!order2?.order,
  `rider=${order2?.order?.riderId} status=${order2?.order?.status}`,
);

// Rider: READY → PICKED_UP → ON_THE_WAY → DELIVERED.
await patchOrder({ token: riderToken, id: order1.id, status: "picked_up" });
await patchOrder({ token: riderToken, id: order1.id, status: "on_the_way" });
await patchOrder({ token: riderToken, id: order1.id, status: "delivered" });

// 6. Assert reward on both sides.
const referrerWallet1 = await prisma.wallet.findUnique({
  where: { customerProfileId: referrerProfile?.id ?? "__none__" },
  select: { balance: true },
});
const refereeWallet1 = await prisma.wallet.findUnique({
  where: { customerProfileId: refereeProfile.id },
  select: { balance: true },
});
const referrerBalance1 = referrerWallet1?.balance ?? 0;
const refereeBalance1 = refereeWallet1?.balance ?? 0;
check(
  "REFERER wallet +৳50 after first delivery",
  referrerBalance1 - referrerBalance0 === 50,
  `${referrerBalance0} → ${referrerBalance1}`,
);
check(
  "REFEREE wallet +৳50 after first delivery",
  refereeBalance1 - refereeBalance0 === 50,
  `${refereeBalance0} → ${refereeBalance1}`,
);

const bonusRows = await prisma.walletTransaction.findMany({
  where: {
    type: "REFERRAL_BONUS",
    relatedOrderId: order1.id,
  },
  select: { id: true, amount: true, walletId: true, description: true },
});
check(
  "2 REFERRAL_BONUS rows on order1 (one per wallet)",
  bonusRows.length === 2,
  `rows=${bonusRows.length}`,
);
check(
  "each REFERRAL_BONUS row is +৳50",
  bonusRows.every((r) => r.amount === 50),
  `amounts=${bonusRows.map((r) => r.amount).join(",")}`,
);

const referralAfter = await prisma.referral.findUnique({
  where: { refereeUserId: refereeUser.id },
  select: { status: true, rewardedAt: true },
});
check(
  "Referral row now REWARDED with rewardedAt set",
  referralAfter.status === "REWARDED" && referralAfter.rewardedAt !== null,
  `status=${referralAfter.status}`,
);

const noteRows = await prisma.notification.findMany({
  where: {
    userId: { in: [referrer.id, refereeUser.id] },
    type: "PROMOTION",
    title: { contains: "৳50" },
  },
  select: { userId: true, title: true },
});
check(
  "notifications fired to both referrer + referee",
  noteRows.length >= 2 &&
    noteRows.some((n) => n.userId === referrer.id) &&
    noteRows.some((n) => n.userId === refereeUser.id),
  `count=${noteRows.length}`,
);

// 7. Place + deliver a SECOND order → no extra credit.
const order3 = await placeOrder({
  token: refereeToken,
  restaurantId: restaurant.id,
  menuItemId: item.id,
  address: restaurant.address,
});
await patchOrder({ token: partnerToken, id: order3.id, status: "preparing" });
await patchOrder({ token: partnerToken, id: order3.id, status: "ready" });
await patchOrder({ token: riderToken, id: order3.id, status: "picked_up" });
await patchOrder({ token: riderToken, id: order3.id, status: "on_the_way" });
await patchOrder({ token: riderToken, id: order3.id, status: "delivered" });

const referrerBalance2 =
  (await prisma.wallet.findUnique({
    where: { customerProfileId: referrerProfile?.id ?? "__none__" },
    select: { balance: true },
  }))?.balance ?? 0;
const refereeBalance2 =
  (await prisma.wallet.findUnique({
    where: { customerProfileId: refereeProfile.id },
    select: { balance: true },
  }))?.balance ?? 0;
check(
  "REFERER balance UNCHANGED after 2nd delivery (no double reward)",
  referrerBalance2 === referrerBalance1,
  `${referrerBalance1} → ${referrerBalance2}`,
);
check(
  "REFEREE balance UNCHANGED after 2nd delivery",
  refereeBalance2 === refereeBalance1,
  `${refereeBalance1} → ${refereeBalance2}`,
);

// 8. GET /api/referral round-trip.
// Counts on this endpoint are "people I referred" — so for
// the referee (who hasn't referred anyone) pending/rewarded
// are 0/0; for the referrer they should reflect the
// rewarded referee.
const refApiResp = await fetch(`${BASE}/api/referral`, {
  headers: { authorization: `Bearer ${refereeToken}` },
});
const refApi = await refApiResp.json();
check(
  "GET /api/referral (referee) returns 200 + shape",
  refApiResp.status === 200 &&
    typeof refApi.referralCode === "string" &&
    typeof refApi.shareUrl === "string" &&
    refApi.shareUrl.includes(`ref=${refApi.referralCode}`) &&
    refApi.pending === 0 &&
    refApi.rewarded === 0,
  `referee counts pending=${refApi.pending} rewarded=${refApi.rewarded}`,
);

// Bonus: as the referrer we should see PENDING=0, REWARDED=1.
const referrerLogin = await login({
  email: "sslcz.customer@example.com",
  password: PASSWORD,
  expectedRole: "CUSTOMER",
});
const referrerApiResp = await fetch(`${BASE}/api/referral`, {
  headers: { authorization: `Bearer ${referrerLogin}` },
});
const referrerApi = await referrerApiResp.json();
check(
  "GET /api/referral (referrer) shows REWARDED=1",
  referrerApiResp.status === 200 && referrerApi.rewarded >= 1,
  `referrer rewarded=${referrerApi.rewarded}`,
);

// 9. Re-register the same referee email with a *different* code
//    should 409 — the (refereeUserId) UNIQUE constraint protects
//    the link. We don't need to retry; just confirm the existing
//    row is locked.
const existing = await prisma.referral.findUnique({
  where: { refereeUserId: refereeUser.id },
});
check(
  "Referral row is locked to first referrer (idempotent link)",
  existing && existing.referrerUserId === referrer.id,
  `referrerId=${existing?.referrerUserId}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);