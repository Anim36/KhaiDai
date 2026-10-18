// End-to-end: /about page has only Taj Mohammad Anim in the
// "Meet the Team" section.
//
// কাজ ২ — assertions:
//   • /about returns 200 + no crash markers
//   • The page contains "Taj Mohammad Anim"
//   • The page contains "Founder & Developer"
//   • None of the prior demo names (Tanvir Ahmed, Sadia Rahman,
//     Imran Hossain, Nusrat Jahan) appear in the rendered HTML

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

const res = await fetch(`${BASE}/about`);
const html = await res.text();
const fails = [];
if (res.status !== 200) fails.push(`status=${res.status}`);
if (html.length < 500) fails.push(`bodyLen=${html.length}`);
if (html.includes("Rendered more hooks")) fails.push(`hooks crash leaked`);
if (html.includes("Minified React error")) fails.push(`minified react error`);
record(
  "GET /about returns 200 + no hooks crash",
  fails.length === 0,
  fails.join("; "),
);

record(
  "Page contains 'Taj Mohammad Anim'",
  html.includes("Taj Mohammad Anim"),
  `not found`,
);
record(
  "Page contains 'Founder & Developer' (HTML-encoded ok)",
  html.includes("Founder & Developer") || html.includes("Founder &amp; Developer"),
  `not found`,
);
const demoNames = ["Tanvir Ahmed", "Sadia Rahman", "Imran Hossain", "Nusrat Jahan"];
const leaks = demoNames.filter((n) => html.includes(n));
record(
  "Demo team-member names NOT present",
  leaks.length === 0,
  `leaked=${leaks.join(",")}`,
);

console.log("\n================================================");
console.log(`ABOUT E2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);