// scripts/probe-customer-options-modal.ts
//
// Bug — "Customer Add bypasses option modal" regression check.
//
// What it asserts:
//   1. Partner seeds a `Tandori Chicken` item with a
//      `vtytft` Multi-choice option group (two choices,
//      one +৳30, one +৳40).
//   2. GET /api/restaurants/[id] returns the menu item WITH
//      its nested `options[].choices[]` (the bug was that
//      the include was missing — so the client never saw
//      `options` and skipped straight to `cart.tryAdd`).
//   3. POST /api/orders with `selectedOptions: [{optionId,
//      choiceIds:[…+৳30 choice]}]` is accepted (201) and the
//      linePrice = base + 30.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Pa55word!";
const CUSTOMER: Credentials = {
  email: "sslcz.customer@example.com",
  password: PASSWORD,
  expectedRole: "CUSTOMER",
};
const PARTNER: Credentials = {
  email: "sslcz.partner@example.com",
  password: PASSWORD,
  expectedRole: "PARTNER",
};

const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: a });

let pass = 0, fail = 0;
function check(name: string, ok: boolean, info: string = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}${info ? " — " + info : ""}`); }
  else    { fail++; console.log(`  ✗ ${name}${info ? " — " + info : ""}`); }
}

type Credentials = { email: string; password: string; expectedRole: "CUSTOMER" | "PARTNER" | "RIDER" | "ADMIN" };
async function login({ email, password, expectedRole }: Credentials) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).token as string;
}

async function main() {
  await runProbe();
}

async function runProbe() {
const customerToken = await login(CUSTOMER);
const partner = await prisma.user.findUniqueOrThrow({
  where: { email: PARTNER.email },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true, address: true },
});

// Re-seed (idempotent): find or create Tandori Chicken + its
// `vtytft` option group. We can't hard-delete a menu item that
// has OrderItem rows (FK constraint) so the safer pattern is
// to upsert and overwrite the option tree in-place.
let baseItem = await prisma.menuItem.findFirst({
  where: { restaurantId: restaurant.id, name: "Tandori Chicken" },
  select: { id: true, price: true, name: true },
});
if (!baseItem) {
  baseItem = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      name: "Tandori Chicken",
      price: 250,
      category: "Mains",
      available: true,
    },
    select: { id: true, price: true, name: true },
  });
}

// Wipe + re-apply the option tree (this item isn't on
// anyone's orders yet — Feat 1 was just landed).
await prisma.menuItemOptionChoice.deleteMany({
  where: { option: { menuItemId: baseItem.id } },
});
await prisma.menuItemOption.deleteMany({
  where: { menuItemId: baseItem.id },
});

const option = await prisma.menuItemOption.create({
  data: {
    menuItemId: baseItem.id,
    name: "vtytft",
    type: "MULTI_CHOICE",
    required: false,
    sortOrder: 0,
    choices: {
      create: [
        { label: "Extra Egg", priceDelta: 30, sortOrder: 0 },
        { label: "Extra Cheese", priceDelta: 40, sortOrder: 1 },
      ],
    },
  },
  include: { choices: true },
});
check(
  "partner-side option group seeded (vtytft, MULTI_CHOICE)",
  option.choices.length === 2,
  `choices=${option.choices.length}`,
);
const egg = option.choices.find((c) => c.label === "Extra Egg");
check("seeded 'Extra Egg' choice (+৳30)", !!egg && egg.priceDelta === 30, `priceDelta=${egg?.priceDelta}`);

// ---- Customer-facing fetch ----------------------------------------
const detail = await fetch(`${BASE}/api/restaurants/${restaurant.id}`);
const detailJson = await detail.json();
check(
  "GET /api/restaurants/[id] returns 200",
  detail.status === 200,
  `status=${detail.status}`,
);
// `restaurant.menu` is bucketed as `MenuCategory[]`. Flatten
// the categories so we can match by item name.
type MenuItemOptionChoiceDTO = { id: string; name: string; priceDelta: number };
type MenuItemOptionDTO = { id: string; name: string; type: string; choices: MenuItemOptionChoiceDTO[] };
type MenuItemDTO = { id: string; name: string; options?: MenuItemOptionDTO[] };
type MenuCategoryDTO = { name: string; items: MenuItemDTO[] };
const flatMenu = (detailJson?.restaurant?.menu ?? []).flatMap(
  (c: MenuCategoryDTO) => c.items ?? [],
);
const item = flatMenu.find((m: MenuItemDTO) => m.name === "Tandori Chicken");
check(
  "Tandori Chicken item present in API response",
  !!item,
  `menuCategories=${detailJson?.restaurant?.menu?.length} flatItems=${flatMenu.length}`,
);
check(
  "item.options array is present and non-empty",
  Array.isArray(item?.options) && item.options.length === 1,
  `options=${item?.options?.length}`,
);
check(
  "item.options[].choices round-trips both choices",
  item?.options?.[0]?.choices?.length === 2,
  `choices=${item?.options?.[0]?.choices?.length}`,
);
check(
  "choice.priceDelta preserved",
  item?.options?.[0]?.choices?.some((c: MenuItemOptionChoiceDTO) => c.priceDelta === 30) &&
    item?.options?.[0]?.choices?.some((c: MenuItemOptionChoiceDTO) => c.priceDelta === 40),
  `deltas=${item?.options?.[0]?.choices?.map((c: MenuItemOptionChoiceDTO) => c.priceDelta).join(",")}`,
);

// ---- Customer order POST -----------------------------------------
const order = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${customerToken}`,
  },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [
      {
        menuItemId: baseItem.id,
        quantity: 1,
        selectedOptions: [{ optionId: option.id, choiceIds: egg ? [egg.id] : [] }],
      },
    ],
    deliveryAddress: restaurant.address,
    paymentMethod: "CASH",
  }),
});
const orderJson = await order.json();
check(
  "POST /api/orders with selectedOptions returns 201",
  order.status === 201,
  `status=${order.status}`,
);
check(
  "server-recomputed linePrice = base + priceDelta (250 + 30 = 280)",
  orderJson?.order?.items?.[0]?.price === 280,
  `linePrice=${orderJson?.order?.items?.[0]?.price}`,
);
check(
  "selectedOptions snapshot persisted on the OrderItem",
  Array.isArray(orderJson?.order?.items?.[0]?.selectedOptions) &&
    orderJson.order.items[0].selectedOptions.length === 1 &&
    orderJson.order.items[0].selectedOptions[0].choiceLabels[0] === "Extra Egg",
  `snapshot=${JSON.stringify(orderJson?.order?.items?.[0]?.selectedOptions)}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});