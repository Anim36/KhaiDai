// scripts/check-bkash-orientation.js — final orientation check.
//
// Reference image analysis:
//   - The bird occupies the upper-right region of the tile.
//   - The head/beak triangle is in the UPPER-LEFT of the bird
//     (small triangle in the upper-left corner of the silhouette).
//   - The tail wedge is on the far right edge.
//   - The lower wing apex is at the bottom.
//
// We verify by checking that:
//   (a) leftmost white pixel is in the UPPER half (head/beak tip)
//   (b) rightmost white pixel is in the UPPER half (tail wedge)
//   (c) topmost white pixel is to the LEFT of centre (beak tip)
//   (d) bottommost white pixel is to the RIGHT of centre (lower wing apex)

const fs = require("fs");
const { Resvg } = require("@resvg/resvg-js");

const SRC = "d:/KhaiDai/khaidai/public/icons/bkash-logo.svg";
const svg = fs.readFileSync(SRC, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 256 },
  background: "rgba(0,0,0,0)",
});
const r = resvg.render();
const w = r.width, h = r.height;
const px = r.pixels;

const isWhite = (i) => px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240;

let leftMost = { x: w, y: -1 };
let rightMost = { x: -1, y: -1 };
let topMost = { x: -1, y: h };
let bottomMost = { x: -1, y: -1 };

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!isWhite(i)) continue;
    if (x < leftMost.x) leftMost = { x, y };
    if (x > rightMost.x) rightMost = { x, y };
    if (y < topMost.y) topMost = { x, y };
    if (y > bottomMost.y) bottomMost = { x, y };
  }
}

const checks = [
  {
    name: "leftmost white pixel is in UPPER half (head/beak tip is high)",
    pass: leftMost.y < h / 2,
    got: `(${leftMost.x}, ${leftMost.y})`,
  },
  {
    name: "rightmost white pixel is in UPPER half (tail wedge is high)",
    pass: rightMost.y < h / 2,
    got: `(${rightMost.x}, ${rightMost.y})`,
  },
  {
    name: "topmost white pixel is to the LEFT of centre (beak tip is on the left)",
    pass: topMost.x < w / 2,
    got: `(${topMost.x}, ${topMost.y})`,
  },
  {
    name: "bottommost white pixel is at the bottom (lower-wing apex extends down)",
    pass: bottomMost.y > h * 0.7,
    got: `(${bottomMost.x}, ${bottomMost.y})`,
  },
];

let allPass = true;
for (const c of checks) {
  console.log(`${c.pass ? "✓" : "✗"} ${c.name}`);
  console.log(`    anchor: ${c.got}`);
  if (!c.pass) allPass = false;
}

console.log(
  `\n${allPass ? "✓ Bird orientation matches the reference image." : "✗ Bird is mirrored — fix the SVG."}`
);
process.exit(allPass ? 0 : 1);
