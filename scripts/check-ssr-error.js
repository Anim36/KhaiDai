// Save the full response so we can grep for SSR errors.
const fs = require("node:fs");
const path = require("node:path");
const BASE = "http://localhost:3000";
const TOKEN = fs.readFileSync(path.join(__dirname, ".admin-token"), "utf8");

async function main() {
  const r = await fetch(`${BASE}/admin/riders`, {
    headers: { cookie: `khaidai_role=ADMIN; khaidai_token=${TOKEN}` },
  });
  const text = await r.text();
  const out = path.join(__dirname, "riders-resp.html");
  fs.writeFileSync(out, text);
  console.log("wrote", out, "len=", text.length);

  // Look for telltale error markers.
  for (const pat of [
    "window is not defined",
    "ReferenceError",
    "Server Error",
    "Internal Server Error",
    "TypeError",
    "is not a function",
    "digest",
  ]) {
    const idx = text.indexOf(pat);
    if (idx !== -1) {
      console.log(`HIT ${pat} @ ${idx}`);
      console.log(text.slice(Math.max(0, idx - 100), idx + 200));
    }
  }
}

main();