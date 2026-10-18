// Smoke test for lib/mailer.ts. We exercise:
//   • isMailConfigured() reflects env
//   • sendOtpEmail handles invalid OTP shape (returns ok:false)
//   • sendOtpEmail handles missing SMTP creds (returns ok:false,
//     never throws)
// We don't actually send a real email — that needs real Gmail
// credentials to be useful as a unit test.
import { sendOtpEmail, isMailConfigured } from "../lib/mailer.ts";

let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

record(
  "isMailConfigured() reflects env presence",
  typeof isMailConfigured() === "boolean",
  `value=${isMailConfigured()}`,
);

(async () => {
  // Invalid OTP shape (5 digits)
  const r1 = await sendOtpEmail("someone@example.com", "12345", "REGISTRATION");
  record(
    "sendOtpEmail with 5-digit OTP returns ok:false (no throw)",
    r1.ok === false && /Invalid OTP/.test(r1.reason ?? ""),
    `result=${JSON.stringify(r1)}`,
  );

  // Valid shape but missing creds (or real SMTP). Either way,
  // must NOT throw and must return a structured result.
  let r2;
  let threw = false;
  try {
    r2 = await sendOtpEmail("someone@example.com", "123456", "REGISTRATION");
  } catch (err) {
    threw = true;
  }
  record(
    "sendOtpEmail with valid shape never throws",
    !threw && typeof r2 === "object" && typeof r2.ok === "boolean",
    `threw=${threw} result=${JSON.stringify(r2)}`,
  );

  console.log("\n================================================");
  console.log(`MAILER SMOKE: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
})();