// scripts/test-notification-api.mjs — exercise the
// /api/users/me PATCH endpoint with each notification field
// independently and verify the others are preserved.

const BASE = "http://localhost:3000";
const EMAIL = "toggle-test@khaidai.test";

// Register the test user (idempotent — server returns 409 if it
// already exists, which we ignore).
const regRes = await fetch(BASE + "/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: EMAIL,
    password: "Password1!",
    name: "Toggle Test",
    role: "CUSTOMER",
    phone: "+8801700000000",
  }),
});
if (regRes.ok) {
  console.log("Registered fresh test user.");
} else {
  console.log("Register returned", regRes.status, "— likely already exists, continuing.");
}

// Login to get a JWT.
const loginRes = await fetch(BASE + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: "Password1!" }),
});
if (!loginRes.ok) {
  console.error("Login failed:", loginRes.status, await loginRes.text());
  process.exit(1);
}
const { token, user } = await loginRes.json();
console.log("Logged in:", user.email);

async function me(method = "GET", body) {
  const res = await fetch(BASE + "/api/users/me", {
    method,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

// GET — should show all three flags
const initial = await me();
console.log("\nInitial state:", initial.body.user);

// Flip just notifyOrderUpdates to false. The other two must stay true.
const flip1 = await me("PATCH", { notifyOrderUpdates: false });
console.log("\nAfter PATCH notifyOrderUpdates=false:", flip1.body.user);

// Flip just notifyPromotions to false. notifyOrderUpdates must stay
// false (we changed it last step) and notifyNewsletter must stay true.
const flip2 = await me("PATCH", { notifyPromotions: false });
console.log("\nAfter PATCH notifyPromotions=false:", flip2.body.user);

// Flip notifyNewsletter to false. Both previous flips must persist.
const flip3 = await me("PATCH", { notifyNewsletter: false });
console.log("\nAfter PATCH notifyNewsletter=false:", flip3.body.user);

// Try the legacy key — should be silently ignored.
const legacy = await me("PATCH", { notificationsEnabled: true });
console.log("\nAfter PATCH legacy notificationsEnabled=true:", legacy.body.user);

// Restore all to true so the test is idempotent.
await me("PATCH", {
  notifyOrderUpdates: true,
  notifyPromotions: true,
  notifyNewsletter: true,
});
console.log("\nRestored to defaults for re-run safety.");
