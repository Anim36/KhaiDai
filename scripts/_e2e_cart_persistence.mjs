// Unit test for the localStorage-backed cart persistence module
// (কাজ ১). We polyfill `window.localStorage` so the module behaves
// exactly as it does in the browser, and walk through every code
// path the CartProvider uses.

import {
  clearPersistedCart,
  readPersistedCart,
  snapshotFor,
  writePersistedCart,
} from "../lib/cart-storage.ts";

let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

function makeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  };
}

function withWindow(fn) {
  const saved = globalThis.window;
  globalThis.window = makeWindow();
  try {
    return fn(globalThis.window);
  } finally {
    if (saved === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = saved;
    }
  }
}

// 1. Empty storage → readPersistedCart returns null.
withWindow(() => {
  const got = readPersistedCart();
  record("Empty localStorage -> readPersistedCart returns null", got === null, `got=${JSON.stringify(got)}`);
});

// 2. Round-trip: write then read.
withWindow(() => {
  const snap = snapshotFor("rest-1", "Test Resto", [
    { item: { id: "m1", name: "Tikka", price: 250, image: "", restaurantId: "rest-1" }, quantity: 2 },
  ]);
  writePersistedCart(snap);
  const got = readPersistedCart();
  record(
    "write -> read round-trip preserves restaurantId/name/lines",
    got !== null &&
      got.restaurantId === "rest-1" &&
      got.restaurantName === "Test Resto" &&
      Array.isArray(got.lines) &&
      got.lines.length === 1 &&
      got.lines[0].item.id === "m1" &&
      got.lines[0].quantity === 2,
    `got=${JSON.stringify(got)}`,
  );
  record(
    "round-trip preserves version=1",
    got?.version === 1,
    `version=${got?.version}`,
  );
});

// 3. Clear: readPersistedCart returns null after clearPersistedCart.
withWindow(() => {
  writePersistedCart(
    snapshotFor("rest-1", "Test", [
      { item: { id: "m1", name: "X", price: 1, image: "", restaurantId: "rest-1" }, quantity: 1 },
    ]),
  );
  clearPersistedCart();
  record("clearPersistedCart removes the slot", readPersistedCart() === null, "still has data");
});

// 4. Malformed JSON -> readPersistedCart returns null (no throw).
withWindow(() => {
  globalThis.window.localStorage.setItem("khaidai.cart.v1", "{not-json");
  let got;
  try {
    got = readPersistedCart();
  } catch (err) {
    record("Malformed JSON doesn't throw", false, `threw: ${err.message}`);
    return;
  }
  record(
    "Malformed JSON returns null (tolerated)",
    got === null,
    `got=${JSON.stringify(got)}`,
  );
});

// 5. Version mismatch -> returns null.
withWindow(() => {
  globalThis.window.localStorage.setItem(
    "khaidai.cart.v1",
    JSON.stringify({ version: 99, restaurantId: "r", restaurantName: "n", lines: [] }),
  );
  const got = readPersistedCart();
  record("Version mismatch returns null", got === null, `got=${JSON.stringify(got)}`);
});

// 6. Replacing cart replaces the snapshot (no merge, no leftover).
withWindow(() => {
  writePersistedCart(
    snapshotFor("rest-A", "A", [
      { item: { id: "mA", name: "A", price: 1, image: "", restaurantId: "rest-A" }, quantity: 1 },
    ]),
  );
  writePersistedCart(
    snapshotFor("rest-B", "B", [
      { item: { id: "mB", name: "B", price: 1, image: "", restaurantId: "rest-B" }, quantity: 3 },
    ]),
  );
  const got = readPersistedCart();
  record(
    "Second write replaces the first (single-restaurant-cart preserved)",
    got?.restaurantId === "rest-B" &&
      got?.lines.length === 1 &&
      got?.lines[0].quantity === 3,
    `got=${JSON.stringify(got)}`,
  );
});

// 7. Defensive parse: missing item.id is filtered out.
withWindow(() => {
  globalThis.window.localStorage.setItem(
    "khaidai.cart.v1",
    JSON.stringify({
      version: 1,
      restaurantId: "rest-1",
      restaurantName: "Test",
      lines: [
        { item: { id: "ok", name: "OK", price: 1, image: "", restaurantId: "rest-1" }, quantity: 1 },
        { item: null, quantity: 1 },
        { item: { id: 123 }, quantity: 1 },
        { quantity: 1 },
      ],
    }),
  );
  const got = readPersistedCart();
  record(
    "Defensive parse filters out malformed lines",
    got !== null && got.lines.length === 1 && got.lines[0].item.id === "ok",
    `lines=${JSON.stringify(got?.lines)}`,
  );
});

// 8. Defensive parse: quantity <= 0 is filtered out.
withWindow(() => {
  globalThis.window.localStorage.setItem(
    "khaidai.cart.v1",
    JSON.stringify({
      version: 1,
      restaurantId: "rest-1",
      restaurantName: "Test",
      lines: [
        { item: { id: "m", name: "M", price: 1, image: "", restaurantId: "rest-1" }, quantity: 0 },
        { item: { id: "m2", name: "M2", price: 1, image: "", restaurantId: "rest-1" }, quantity: 2 },
      ],
    }),
  );
  const got = readPersistedCart();
  record(
    "Defensive parse filters out qty<=0 lines",
    got !== null && got.lines.length === 1 && got.lines[0].quantity === 2,
    `lines=${JSON.stringify(got?.lines)}`,
  );
});

// 9. SSR (no window) -> read/write/clear are all no-ops, no throws.
(() => {
  const saved = globalThis.window;
  delete globalThis.window;
  try {
    let threw = false;
    try {
      const r = readPersistedCart();
      if (r !== null) threw = true;
      writePersistedCart(snapshotFor("x", "y", []));
      clearPersistedCart();
    } catch { threw = true; }
    record(
      "Without window, read/write/clear are no-ops and don't throw",
      !threw,
      `typeof window=${typeof window}`,
    );
  } finally {
    if (saved !== undefined) globalThis.window = saved;
  }
})();

console.log("\n================================================");
console.log(`CART PERSISTENCE E2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);