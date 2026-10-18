// Fetch /admin/riders server-side with the correct role cookie
// so the middleware doesn't redirect to /admin/login.
const fs = require("node:fs");
const path = require("node:path");
const BASE = "http://localhost:3000";
const TOKEN = fs.readFileSync(path.join(__dirname, ".admin-token"), "utf8");

async function main() {
  const r = await fetch(`${BASE}/admin/riders`, {
    headers: {
      cookie: `khaidai_role=ADMIN; khaidai_token=${TOKEN}`,
    },
  });
  console.log("status:", r.status);
  const text = await r.text();
  console.log("length:", text.length);
  const match = text.match(/window is not defined[^\n]*/);
  if (match) console.log("MATCH:", match[0]);
  const err = text.match(
    /<pre[^>]*id="__next_error__"[^>]*>([\s\S]*?)<\/pre>/,
  );
  if (err) console.log("ERROR:", err[1].slice(0, 400));
  const traceMatch = text.match(/"digest"\s*:\s*"([^"]+)"/);
  if (traceMatch) console.log("digest:", traceMatch[1]);
  console.log("---HEAD---");
  console.log(text.slice(0, 800));
}

main();