// scripts/export-payment-logos.js — convert every SVG under
// public/icons/ whose filename starts with one of the supported
// payment-method prefixes (bkash, nagad, rocket) into a 852×852
// PNG so consumers using next/image get a standard raster asset.
//
// Re-run after editing any of the .svg sources in this directory.

const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const ICONS_DIR = path.resolve(__dirname, "..", "public", "icons");
const PREFIXES = ["bkash-logo", "nagad-logo", "rocket-logo"];

for (const entry of fs.readdirSync(ICONS_DIR)) {
  if (!entry.endsWith(".svg")) continue;
  const base = entry.replace(/\.svg$/, "");
  if (!PREFIXES.some((p) => base.startsWith(p))) continue;
  const src = path.join(ICONS_DIR, entry);
  const dst = path.join(ICONS_DIR, `${base}.png`);
  const svg = fs.readFileSync(src, "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 852 },
    background: "rgba(0,0,0,0)",
  });
  const buf = resvg.render().asPng();
  fs.writeFileSync(dst, buf);
  console.log(`Saved ${path.relative(process.cwd(), dst)} (${buf.length.toLocaleString()} bytes)`);
}
