/**
 * Temporary end-to-end smoke test for the SSLCommerz sandbox
 * integration. Drives the real HTTP API against the running dev
 * server and asserts the state machine. Delete after verification.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE = "http://localhost:3000";
const PASSWORD = "Pa55word!";
const CUSTOMER = {
  email: "sslcz.customer@example.com",
  password: PASSWORD,
  expectedRole: "CUSTOMER" as const,
};
const PARTNER = {
  email: "sslcz.partner@example.com",
  password: PASSWORD,
  expectedRole: "PARTNER" as const,
};
const ADMIN = {
  email: "sslcz.admin@example.com",
  password: PASSWORD,
  expectedRole: "ADMIN" as const,
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function login(who: {
  email: string;
  password: string;
  expectedRole: "CUSTOMER" | "PARTNER" | "ADMIN";
}) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(who),
  });
  const json = await res.json();
  const token =
    json?.token ?? json?.data?.token ?? json?.user?.token ?? null;
  if (!token) throw new Error(`login failed: ${JSON.stringify(json)}`);
  return token as string;
}

async function main() {
  const customerToken = await login(CUSTOMER);
  const partnerToken = await login(PARTNER);
  const adminToken = await login(ADMIN);
  console.log("\n== logged in (customer / partner / admin) ==\n");

  const restaurant = await prisma.restaurant.findFirst({
    where: { name: "SSLCommerz Test Kitchen" },
  });
  const menuItem = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant!.id },
  });
  const address = await prisma.address.findFirst({
    where: { userId: (await prisma.user.findUniqueOrThrow({
      where: { email: CUSTOMER.email },
    })).id },
  });

  /* ---------------------------------------------------------------- */
  /* 1. Checkout → init → gateway redirect URL                          */
  /* ---------------------------------------------------------------- */
  console.log("== 1. bKash checkout opens an SSLCommerz session ==");
  const created = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      restaurantId: restaurant!.id,
      items: [{ menuItemId: menuItem!.id, quantity: 2 }],
      deliveryAddress: address!.fullAddress,
      paymentMethod: "BKASH",
    }),
  });
  const createdJson = await created.json();
  const orderId = createdJson?.order?.id as string | undefined;
  check("POST /api/orders creates the order", created.status === 201 && !!orderId,
    `status=${created.status} body=${JSON.stringify(createdJson).slice(0, 200)}`);
  if (!orderId) throw new Error("no order id — aborting");

  const afterCreate = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentGatewayStatus: true, status: true, paymentMethod: true },
  });
  check(
    "new order starts at paymentGatewayStatus=NOT_INITIATED",
    afterCreate.paymentGatewayStatus === "NOT_INITIATED",
    `got=${afterCreate.paymentGatewayStatus}`,
  );
  check(
    "new order status is PENDING",
    afterCreate.status === "PENDING",
    `got=${afterCreate.status}`,
  );

  const init = await fetch(`${BASE}/api/payments/sslcommerz/init`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({ orderId }),
  });
  const initJson = await init.json();
  const gatewayPageURL = initJson?.gatewayPageURL as string | undefined;
  check(
    "POST /init returns a GatewayPageURL",
    init.status === 200 && !!gatewayPageURL,
    `status=${init.status} body=${JSON.stringify(initJson).slice(0, 300)}`,
  );
  check(
    "GatewayPageURL points at the SSLCommerz sandbox",
    !!gatewayPageURL && gatewayPageURL.includes("sandbox.sslcommerz.com"),
    `url=${gatewayPageURL}`,
  );
  console.log(`  ->  ${gatewayPageURL?.slice(0, 110)}…`);

  const afterInit = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentGatewayStatus: true, gatewaySessionKey: true },
  });
  check(
    "after init: paymentGatewayStatus=PENDING",
    afterInit.paymentGatewayStatus === "PENDING",
    `got=${afterInit.paymentGatewayStatus}`,
  );
  check(
    "after init: gatewaySessionKey is stored",
    !!afterInit.gatewaySessionKey,
  );

  /* ---------------------------------------------------------------- */
  /* 2. Spoofed success redirect must NOT mark the order PAID           */
  /* ---------------------------------------------------------------- */
  console.log("\n== 2. security: a spoofed success redirect is rejected ==");
  const spoof = await fetch(
    `${BASE}/api/payments/sslcommerz/success?status=VALID&tran_id=${orderId}&val_id=fake-val-id-12345`,
    { redirect: "manual" },
  );
  const afterSpoof = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentGatewayStatus: true, status: true },
  });
  check(
    "spoofed success does NOT set PAID (server-to-server validation ran)",
    afterSpoof.paymentGatewayStatus !== "PAID",
    `got=${afterSpoof.paymentGatewayStatus}`,
  );
  check(
    "spoofed success leaves Order.status at PENDING",
    afterSpoof.status === "PENDING",
    `got=${afterSpoof.status}`,
  );
  check(
    "spoofed success redirects back to /checkout",
    (spoof.headers.get("location") ?? "").includes("/checkout"),
    `loc=${spoof.headers.get("location")}`,
  );

  /* ---------------------------------------------------------------- */
  /* 3. Unpaid order is hidden from the partner queue                   */
  /* ---------------------------------------------------------------- */
  console.log("\n== 3. unpaid orders never reach the partner dashboard ==");
  const partnerList = await fetch(`${BASE}/api/orders`, {
    headers: { authorization: `Bearer ${partnerToken}` },
  });
  const partnerJson = await partnerList.json();
  const partnerOrders: Array<{ id: string }> = partnerJson?.orders ?? [];
  check(
    `partner queue hides the unpaid ${orderId.slice(-6)} order`,
    !partnerOrders.some((o) => o.id === orderId),
    `partner sees ${partnerOrders.length} orders`,
  );

  /* ---------------------------------------------------------------- */
  /* 4. Cancel callback → CANCELLED, back to /checkout, cart intact     */
  /* ---------------------------------------------------------------- */
  console.log("\n== 4. cancel callback ==");
  const cancel = await fetch(
    `${BASE}/api/payments/sslcommerz/cancel?tran_id=${orderId}&val_id=x`,
    { redirect: "manual" },
  );
  const afterCancel = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentGatewayStatus: true, status: true },
  });
  check(
    "cancel sets paymentGatewayStatus=CANCELLED",
    afterCancel.paymentGatewayStatus === "CANCELLED",
    `got=${afterCancel.paymentGatewayStatus}`,
  );
  check(
    "cancel leaves Order.status untouched (PENDING)",
    afterCancel.status === "PENDING",
    `got=${afterCancel.status}`,
  );
  check(
    "cancel redirects back to /checkout with an error message",
    (cancel.headers.get("location") ?? "").includes("/checkout?error="),
    `loc=${cancel.headers.get("location")}`,
  );

  /* ---------------------------------------------------------------- */
  /* 5. Retry after cancel is allowed (status CANCELLED → PENDING)     */
  /* ---------------------------------------------------------------- */
  console.log("\n== 5. retry after a cancel is allowed ==");
  const retry = await fetch(`${BASE}/api/payments/sslcommerz/init`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({ orderId }),
  });
  const retryJson = await retry.json();
  check(
    "a cancelled order can re-init a fresh session",
    retry.status === 200 && !!retryJson?.gatewayPageURL,
    `status=${retry.status}`,
  );

  /* ---------------------------------------------------------------- */
  /* 6. Fail callback → FAILED                                          */
  /* ---------------------------------------------------------------- */
  console.log("\n== 6. fail callback ==");
  const failRes = await fetch(
    `${BASE}/api/payments/sslcommerz/fail?tran_id=${orderId}&error=decline`,
    { redirect: "manual" },
  );
  const afterFail = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentGatewayStatus: true, status: true },
  });
  check(
    "fail sets paymentGatewayStatus=FAILED",
    afterFail.paymentGatewayStatus === "FAILED",
    `got=${afterFail.paymentGatewayStatus}`,
  );
  check(
    "fail leaves Order.status untouched (PENDING)",
    afterFail.status === "PENDING",
    `got=${afterFail.status}`,
  );
  check(
    "fail redirects back to /checkout with an error",
    (failRes.headers.get("location") ?? "").includes("/checkout?error="),
  );

  /* ---------------------------------------------------------------- */
  /* 7. COD still works with no gateway at all                          */
  /* ---------------------------------------------------------------- */
  console.log("\n== 7. Cash on Delivery is untouched ==");
  const cod = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      restaurantId: restaurant!.id,
      items: [{ menuItemId: menuItem!.id, quantity: 1 }],
      deliveryAddress: address!.fullAddress,
      paymentMethod: "CASH",
    }),
  });
  const codJson = await cod.json();
  const codId = codJson?.order?.id as string;
  check("COD order is created", cod.status === 201 && !!codId);

  const codRow = await prisma.order.findUniqueOrThrow({
    where: { id: codId },
    select: { paymentMethod: true, paymentGatewayStatus: true, status: true },
  });
  check(
    "COD order has paymentMethod=CASH",
    codRow.paymentMethod === "CASH",
  );
  check(
    "COD order stays NOT_INITIATED (never touches the gateway)",
    codRow.paymentGatewayStatus === "NOT_INITIATED",
  );

  const codInit = await fetch(`${BASE}/api/payments/sslcommerz/init`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({ orderId: codId }),
  });
  check(
    "init refuses a COD order (409)",
    codInit.status === 409,
    `status=${codInit.status}`,
  );

  // COD must be visible to the partner immediately.
  const partnerAfter = await fetch(`${BASE}/api/orders`, {
    headers: { authorization: `Bearer ${partnerToken}` },
  });
  const partnerAfterJson = await partnerAfter.json();
  const partnerAfterOrders: Array<{ id: string }> =
    partnerAfterJson?.orders ?? [];
  check(
    "partner queue DOES show the COD order",
    partnerAfterOrders.some((o) => o.id === codId),
    `partner sees ${partnerAfterOrders.length}`,
  );
  check(
    "partner queue still hides the abandoned bKash order",
    !partnerAfterOrders.some((o) => o.id === orderId),
  );

  /* ---------------------------------------------------------------- */
  /* 8. Dispatch is blocked on an unpaid order                          */
  /* ---------------------------------------------------------------- */
  console.log("\n== 8. dispatch is blocked until the payment is PAID ==");
  const dispatch = await fetch(`${BASE}/api/orders/${orderId}/dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${partnerToken}`,
    },
    body: JSON.stringify({}),
  });
  check(
    "dispatch on an unpaid gateway order is refused (409)",
    dispatch.status === 409,
    `status=${dispatch.status} body=${(await dispatch.text()).slice(0, 160)}`,
  );

  /* ---------------------------------------------------------------- */
  /* 9. IPN: bogus val_id must not mark PAID                            */
  /* ---------------------------------------------------------------- */
  console.log("\n== 9. IPN is idempotent + validates server-to-server ==");
  const ipn = await fetch(`${BASE}/api/payments/sslcommerz/ipn`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      tran_id: orderId,
      val_id: "fake-val-id-99999",
      status: "VALID",
    }).toString(),
  });
  check("IPN with a bogus val_id still answers 200", ipn.status === 200);
  const afterIpn = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentGatewayStatus: true },
  });
  check(
    "IPN with a bogus val_id does NOT mark PAID",
    afterIpn.paymentGatewayStatus !== "PAID",
    `got=${afterIpn.paymentGatewayStatus}`,
  );

  /* ---------------------------------------------------------------- */
  /* 10. Admin sees the gateway fields                                  */
  /* ---------------------------------------------------------------- */
  console.log("\n== 10. admin sees paymentGatewayStatus + txn id ==");
  const adminList = await fetch(`${BASE}/api/admin/orders?pageSize=100`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const adminJson = await adminList.json();
  const adminRows: Array<Record<string, unknown>> = adminJson?.orders ?? [];
  const row = adminRows.find((o) => o.id === orderId);
  check("admin order list includes the bKash order", !!row);
  check(
    "admin row carries paymentMethod",
    row?.paymentMethod === "BKASH",
    `got=${row?.paymentMethod}`,
  );
  check(
    "admin row carries paymentGatewayStatus",
    typeof row?.paymentGatewayStatus === "string",
    `got=${row?.paymentGatewayStatus}`,
  );
  check(
    "admin row carries gatewayTransactionId (null when unconfirmed)",
    row?.gatewayTransactionId === null,
    `got=${String(row?.gatewayTransactionId)}`,
  );

  const adminDetail = await fetch(`${BASE}/api/admin/orders/${orderId}`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const adminDetailJson = await adminDetail.json();
  check(
    "admin detail includes paymentGatewayStatus",
    adminDetailJson?.order?.paymentGatewayStatus === "FAILED",
    `got=${adminDetailJson?.order?.paymentGatewayStatus}`,
  );
  check(
    "admin detail includes gatewayTransactionId key",
    "gatewayTransactionId" in (adminDetailJson?.order ?? {}),
  );

  /* ---------------------------------------------------------------- */
  /* 11. Order API exposes gateway fields to the customer                */
  /* ---------------------------------------------------------------- */
  const orderGet = await fetch(`${BASE}/api/orders/${orderId}`, {
    headers: { authorization: `Bearer ${customerToken}` },
  });
  const orderGetJson = await orderGet.json();
  check(
    "/api/orders/[id] exposes paymentGatewayStatus",
    orderGetJson?.order?.paymentGatewayStatus === "FAILED",
    `got=${orderGetJson?.order?.paymentGatewayStatus}`,
  );
  check(
    "/api/orders/[id] exposes gatewayTransactionId",
    "gatewayTransactionId" in (orderGetJson?.order ?? {}),
  );

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==\n`);
  console.log(`test order id: ${orderId}`);
  console.log(`cod order id : ${codId}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
