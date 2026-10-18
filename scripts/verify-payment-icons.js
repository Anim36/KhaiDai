// scripts/verify-payment-icons.js — sanity-check each payment
// method icon renders correctly: a single brand-coloured disc
// with a centred white glyph.

const fs = require("fs");
const { Resvg } = require("@resvg/resvg-js");

const TARGETS = [
  {
    file: "d:/KhaiDai/khaidai/public/icons/bkash-logo.svg",
    name: "bKash",
    brand: "#E2136E",
    expectedColor: [0xe2, 0x13, 0x6e],
  },
  {
    file: "d:/KhaiDai/khaidai/public/icons/nagad-logo.svg",
    name: "Nagad",
    brand: "#F26522",
    expectedColor: [0xf2, 0x65, 0x22],
  },
  {
    file: "d:/KhaiDai/khaidai/public/icons/rocket-logo.svg",
    name: "Rocket",
    brand: "#6A2C91",
    expectedColor: [0x6a, 0x2c, 0x91],
  },
];

const RENDER_SIZE = 256;

for (const t of TARGETS) {
  const svg = fs.readFileSync(t.file, "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: RENDER_SIZE },
    background: "rgba(0,0,0,0)",
  });
  const r = resvg.render();
  const w = r.width;
  const h = r.height;
  const px = r.pixels;

  let brandPx = 0,
    whitePx = 0,
    transparentPx = 0;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a < 10) {
      transparentPx++;
      continue;
    }
    const isBrand =
      Math.abs(px[i] - t.expectedColor[0]) < 8 &&
      Math.abs(px[i + 1] - t.expectedColor[1]) < 8 &&
      Math.abs(px[i + 2] - t.expectedColor[2]) < 8;
    const isWhite =
      px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240;
    if (isBrand) brandPx++;
    else if (isWhite) whitePx++;
  }

  // Centroid of white glyph (in tile coordinates 0..RENDER_SIZE)
  let cx = 0,
    cy = 0,
    n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240) {
        cx += x;
        cy += y;
        n++;
      }
    }
  }
  cx = n ? cx / n : 0;
  cy = n ? cy / n : 0;

  const total = w * h;
  const fillPct = ((brandPx + whitePx) / total) * 100;
  const discCenter = RENDER_SIZE / 2;
  const cxOff = Math.abs(cx - discCenter);
  const cyOff = Math.abs(cy - discCenter);
  const centred = cxOff < RENDER_SIZE * 0.06 && cyOff < RENDER_SIZE * 0.06;
  const hasBrand = brandPx > total * 0.5;
  const hasGlyph = whitePx > total * 0.05;

  console.log(`\n${t.name} (${t.brand})`);
  console.log(`  brand fill:    ${(brandPx / total * 100).toFixed(1)}%`);
  console.log(`  white glyph:   ${(whitePx / total * 100).toFixed(1)}%`);
  console.log(`  transparent:   ${(transparentPx / total * 100).toFixed(1)}%`);
  console.log(`  glyph centroid: (${cx.toFixed(1)}, ${cy.toFixed(1)})  off-centre: ${cxOff.toFixed(1)}px x ${cyOff.toFixed(1)}px`);
  console.log(`  ${hasBrand ? "✓" : "✗"} disc renders the brand colour`);
  console.log(`  ${hasGlyph ? "✓" : "✗"} white glyph is visible`);
  console.log(`  ${centred ? "✓" : "✗"} glyph is centred in the disc`);
}
