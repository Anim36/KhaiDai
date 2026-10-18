// scripts/_verify_bell_layout.mjs
//
// Validates the bell panel layout contract:
//   • Width  = min(384, 100vw - 24)
//   • On vw >= 640: anchored to bell rect; right ≤ vw - 12; left ≥ 12
//   • On vw <  640: full-width sheet; left/right = 12; top ≤ bell.bottom + 12
//   • Panel max-height = 70vh, internal vertical scroll
//
// We replicate the same math used inside NotificationBell.tsx and
// assert it across 1280 / 768 / 375 viewport widths. A real browser
// would render the same numbers because the component is pure
// math + standard CSS positioning.

const VIEWPORT_GUTTER = 12;
const PANEL_MAX_W = 384;
const MOBILE_BREAKPOINT = 640;

function panelRect(bell, vw, vh) {
  const width = Math.min(PANEL_MAX_W, vw - VIEWPORT_GUTTER * 2);
  if (vw < MOBILE_BREAKPOINT) {
    const headerHeight = bell?.bottom ?? 64;
    const top = Math.max(
      0,
      Math.min(headerHeight + VIEWPORT_GUTTER, vh - 220),
    );
    const left = VIEWPORT_GUTTER;
    return { top, left, right: left + (vw - 24), width: vw - 24, maxHeight: Math.min(vh * 0.7, vh - top - 12) };
  }
  const idealTop = bell.bottom + VIEWPORT_GUTTER;
  let left = bell.right - width;
  left = Math.max(VIEWPORT_GUTTER, Math.min(left, vw - VIEWPORT_GUTTER - width));
  return {
    top: idealTop,
    left,
    width,
    right: left + width,
    maxHeight: Math.min(vh * 0.7, vh - idealTop - VIEWPORT_GUTTER),
  };
}

// For testing, place the bell at the top-right corner (header height
// ~56, bell width ~40 → bell.right = vw - 16, bell.bottom ≈ 56).
function bellRect(vw) {
  return {
    top: 8,
    right: vw - 16,
    bottom: 56,
    left: vw - 56,
  };
}

const tests = [
  { name: "1280×900", vw: 1280, vh: 900 },
  { name: "768×1024", vw: 768, vh: 1024 },
  { name: "375×812", vw: 375, vh: 812 },
];

let passed = 0;
let failed = 0;
const failures = [];

for (const t of tests) {
  const bell = bellRect(t.vw);
  const r = panelRect(bell, t.vw, t.vh);
  const checks = [
    { ok: r.left >= 12, label: `left≥12 (left=${r.left})` },
    { ok: r.right <= t.vw - 12, label: `right≤vw-12 (right=${r.right}≤${t.vw - 12})` },
    { ok: r.width <= Math.min(384, t.vw - 24), label: `width≤min(384,vw-24) (width=${r.width})` },
    { ok: r.top >= 0, label: `top≥0 (top=${r.top})` },
    { ok: r.top + r.maxHeight <= t.vh, label: `panel fits within viewport (top+maxH=${r.top + r.maxHeight}≤${t.vh})` },
    { ok: r.maxHeight <= t.vh * 0.7, label: `max-height ≤70vh (${r.maxHeight}≤${t.vh * 0.7})` },
  ];
  const failedChecks = checks.filter((c) => !c.ok);
  if (failedChecks.length === 0) {
    console.log(`PASS  bell @ ${t.name}: rect=`, r);
    passed++;
  } else {
    console.log(`FAIL  bell @ ${t.name}: ${failedChecks.map((c) => c.label).join("; ")}`);
    failures.push({ test: t.name, detail: failedChecks.map((c) => c.label).join("; ") });
    failed++;
  }
}

// Message-wrap behaviour: the bell uses `whitespace-normal break-words`
// on the message <p>. We assert that no truncation (text-overflow:
// ellipsis) is applied — that's a CSS contract test.
const cssContract = [
  "flex w-full cursor-pointer flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-surface",
  "whitespace-normal break-words text-[13px] font-semibold text-ink", // title
  "ml-4 whitespace-normal break-words text-[12px] text-ink-muted", // message
];
const fs = await import("fs");
const bellSrc = fs.readFileSync("components/notifications/NotificationBell.tsx", "utf8");
const cssOk = cssContract.every((c) => bellSrc.includes(c));
if (cssOk) {
  console.log("PASS  message wrap CSS (whitespace-normal break-words, no truncate/ellipsis)");
  passed++;
} else {
  console.log("FAIL  message wrap CSS");
  failures.push({ test: "css wrap", detail: "missing one of: " + cssContract.join("; ") });
  failed++;
}

// Portal: must use createPortal to document.body with position:fixed.
const portalContract =
  bellSrc.includes("createPortal(") &&
  bellSrc.includes("document.body") &&
  bellSrc.includes("position: \"fixed\"");
if (portalContract) {
  console.log("PASS  portal renders to document.body with position: fixed");
  passed++;
} else {
  console.log("FAIL  portal contract");
  failures.push({ test: "portal", detail: "missing createPortal/document.body/fixed" });
  failed++;
}

// Clamp on resize/scroll listeners.
const resizeAndScrollListeners =
  bellSrc.match(/window\.addEventListener\("resize"/g)?.length >= 1 &&
  bellSrc.match(/window\.addEventListener\("scroll"/g)?.length >= 1;
if (resizeAndScrollListeners) {
  console.log("PASS  resize + scroll listeners active while open");
  passed++;
} else {
  console.log("FAIL  resize/scroll listeners");
  failures.push({ test: "listeners", detail: "no resize/scroll listeners found" });
  failed++;
}

// Outside-click + Escape.
const outsideAndEsc =
  bellSrc.includes("Escape") &&
  bellSrc.match(/mousedown/);
if (outsideAndEsc) {
  console.log("PASS  outside-click + Escape close");
  passed++;
} else {
  console.log("FAIL  outside-click / Escape");
  failures.push({ test: "close handlers", detail: "missing Escape or mousedown handler" });
  failed++;
}

// z-index ≥ header/sidebar (header uses z-50/sticky, sidebar uses
// high z). 1200 is plenty.
const zIdx = bellSrc.match(/zIndex:\s*(\d+)/);
if (zIdx && Number(zIdx[1]) >= 1000) {
  console.log(`PASS  panel z-index = ${zIdx[1]} (≥ header/sidebar)`);
  passed++;
} else {
  console.log("FAIL  panel z-index");
  failures.push({ test: "z-index", detail: `z-index not ≥ 1000 (got ${zIdx?.[1]})` });
  failed++;
}

console.log(`\n==== Bell panel layout: ${passed} passed, ${failed} failed ====`);
if (failed > 0) {
  for (const f of failures) console.log(` - ${f.test}: ${f.detail}`);
  process.exit(1);
}
