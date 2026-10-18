// scripts/probe-menu-options-api.mjs
//
// Feat 1 API-level probe: create / edit / read a menu item
// with option groups, then assert the server reconciles
// create-update-delete correctly.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Pa55word!";
const PARTNER = {
  email: "sslcz.partner@example.com",
  password: PASSWORD,
  expectedRole: "PARTNER",
};

const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: a });

let pass = 0, fail = 0;
function check(name, ok, info = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}${info ? " — " + info : ""}`); }
  else    { fail++; console.log(`  ✗ ${name}${info ? " — " + info : ""}`); }
}

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(PARTNER),
});
if (!r.ok) throw new Error(`login: ${r.status}`);
const partnerToken = (await r.json()).token;

// Find this partner's restaurant.
const partner = await prisma.user.findUniqueOrThrow({
  where: { email: PARTNER.email },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true },
});

// Create a brand-new probe item.
const createBody = {
  name: "Probe Pasta",
  price: 280,
  category: "mains",
  description: "",
  image: null,
  available: true,
  options: [
    {
      // server-assigned id should appear
      name: "Size",
      type: "SINGLE_CHOICE",
      required: true,
      choices: [
        { label: "Regular", priceDelta: 0 },
        { label: "Large", priceDelta: 50 },
      ],
    },
    {
      name: "Sauce",
      type: "MULTI_CHOICE",
      required: false,
      choices: [
        { label: "Creamy", priceDelta: 20 },
        { label: "Spicy", priceDelta: 10 },
      ],
    },
  ],
};

const cRes = await fetch(`${BASE}/api/menu-items`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${partnerToken}`,
  },
  body: JSON.stringify(createBody),
});
const cJson = await cRes.json();
const created = cJson?.item;
check(
  "POST /api/menu-items 201 with options",
  cRes.status === 201 && Array.isArray(created?.options) && created.options.length === 2,
  `status=${cRes.status} opts=${created?.options?.length}`,
);
const sizeOpt = created?.options?.find((o) => o.name === "Size");
const sauceOpt = created?.options?.find((o) => o.name === "Sauce");
check(
  "options have server-assigned ids + choice ids",
  !!sizeOpt?.id && Array.isArray(sizeOpt.choices) && sizeOpt.choices.every((c) => !!c.id),
  `size.id=${sizeOpt?.id} choiceIds=${sizeOpt?.choices?.map((c) => !!c.id).join(",")}`,
);

// Edit: keep Size, modify it (change required → false, drop Large),
// delete Sauce, add a new "Topping" group.
const updateBody = {
  name: "Probe Pasta v2",
  options: [
    {
      id: sizeOpt.id,
      name: "Size",
      type: "SINGLE_CHOICE",
      required: false,
      choices: [
        // Persisted Regular choice — keep with same id
        { id: sizeOpt.choices.find((c) => c.label === "Regular").id, label: "Regular", priceDelta: 0 },
        { label: "Family", priceDelta: 100 },
      ],
    },
    {
      name: "Topping",
      type: "MULTI_CHOICE",
      required: false,
      choices: [
        { label: "Cheese", priceDelta: 30 },
      ],
    },
  ],
};

const uRes = await fetch(`${BASE}/api/menu-items/${created.id}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${partnerToken}`,
  },
  body: JSON.stringify(updateBody),
});
const uJson = await uRes.json();
const updated = uJson?.item;
const sizeAfter = updated?.options?.find((o) => o.name === "Size");
const sauceStill = updated?.options?.find((o) => o.name === "Sauce");
const topping = updated?.options?.find((o) => o.name === "Topping");
check(
  "PATCH /api/menu-items/[id] 200",
  uRes.status === 200,
  `status=${uRes.status}`,
);
check(
  "Size updated: required=false, Large deleted, Family added",
  sizeAfter?.required === false &&
    !sizeAfter.choices.some((c) => c.label === "Large") &&
    sizeAfter.choices.some((c) => c.label === "Family"),
  `choices=${sizeAfter?.choices?.map((c) => c.label).join("|")}`,
);
check(
  "Sauce group removed",
  !sauceStill,
  `sauceStill=${!!sauceStill}`,
);
check(
  "Topping group created",
  !!topping && topping.choices[0]?.label === "Cheese",
  `topping=${topping?.choices?.map((c) => c.label).join("|")}`,
);

// Validation probe: invalid priceDelta → 400
const bad = await fetch(`${BASE}/api/menu-items/${created.id}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${partnerToken}`,
  },
  body: JSON.stringify({
    options: [
      {
        name: "Bad",
        type: "SINGLE_CHOICE",
        required: false,
        choices: [{ label: "X", priceDelta: 1.5 }],
      },
    ],
  }),
});
check(
  "non-integer priceDelta → 400",
  bad.status === 400,
  `status=${bad.status}`,
);

// Cleanup.
await prisma.menuItemOption.deleteMany({ where: { menuItemId: created.id } });
await prisma.menuItem.delete({ where: { id: created.id } });

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);