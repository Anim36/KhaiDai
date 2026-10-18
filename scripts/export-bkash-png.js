// scripts/export-bkash-png.js — convert public/icons/bkash-logo.svg
// to public/icons/bkash-logo.png at 256×256 so consumers using
// next/image get a standard raster asset.

const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const SRC = path.resolve(__dirname, "..", "public", "icons", "bkash-logo.svg");
const DST = path.resolve(__dirname, "..", "public", "icons", "bkash-logo.png");

const svg = fs.readFileSync(SRC, "utf8");
const resvg = new Resvg(svg, {
  // Render the supplied SVG at its intrinsic 852×852 viewBox so
  // the bird + tile render at the brand-correct resolution.
  fitTo: { mode: "width", value: 852 },
  background: "rgba(0,0,0,0)",
});
const pngData = resvg.render();
const pngBuf = pngData.asPng();
fs.writeFileSync(DST, pngBuf);
console.log(`Saved ${DST} (${pngBuf.length.toLocaleString()} bytes)`);
