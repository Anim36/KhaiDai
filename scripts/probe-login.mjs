// Quick standalone login probe for the smoke-test users.
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

const tests = [
  ["customer-smoke@khaidai.test", "khaidai1234"],
  ["spice175318@khaidai.test", "khaidai1234"],
  ["rahim.smoke@example.com", "khaidai1234"],
  ["rahim.smoke+18074@example.com", "khaidai1234"],
];

for (const [email, password] of tests) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  console.log(email, res.status, await res.text());
}
