const r = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@khaidai.test",
    password: "khaidai1234",
    expectedRole: "ADMIN",
  }),
});
console.log("status:", r.status);
console.log("body:", await r.text());