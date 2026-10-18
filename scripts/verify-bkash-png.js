// scripts/verify-bkash-png.js — sanity-check the regenerated bKash
// icon by sampling its white pixel mass and reporting which quadrant
// it's concentrated in. Used to confirm the bird faces the right way.
//
// Reference image: head/beak triangle is in the UPPER-LEFT quadrant,
// body fills the centre, and the tail wedge sits in the MID-RIGHT.
// Therefore the leftmost white pixel column should sit in the upper
// half of the tile, and the rightmost white pixel column should sit
// in the right half.

const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const SRC = path.resolve(__dirname, "..", "public", "icons", "bkash-logo.svg");

const svg = fs.readFileSync(SRC, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 852 },
  background: "rgba(0,0,0,0)",
  font: { loadSystemFonts: false },
});
const rendered = resvg.render();
const width = rendered.width;
const height = rendered.height;
const pixels = rendered.pixels; // RGBA buffer

const isWhite = (i) => pixels[i] > 240 && pixels[i + 1] > 240 && pixels[i + 2] > 240;

let leftMostX = width,
  leftMostY = height,
  rightMostX = -1,
  rightMostY = -1,
  topMostY = height,
  topMostX = -1,
  bottomMostY = -1,
  bottomMostX = -1;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!isWhite(i)) continue;
    if (x < leftMostX) {
      leftMostX = x;
      leftMostY = y;
    }
    if (x > rightMostX) {
      rightMostX = x;
      rightMostY = y;
    }
    if (y < topMostY) {
      topMostY = y;
      topMostX = x;
    }
    if (y > bottomMostY) {
      bottomMostY = y;
      bottomMostX = x;
    }
  }
}

const report = {
  size: { width, height },
  headAnchor: { x: leftMostX, y: leftMostY, quadrant: quadrant(leftMostX, leftMostY, width, height) },
  tailAnchor: { x: rightMostX, y: rightMostY, quadrant: quadrant(rightMostX, rightMostY, width, height) },
  topAnchor: { x: topMostX, y: topMostY, quadrant: quadrant(topMostX, topMostY, width, height) },
  bottomAnchor: { x: bottomMostX, y: bottomMostY, quadrant: quadrant(bottomMostX, bottomMostY, width, height) },
};

function quadrant(x, y, w, h) {
  const hx = x < w / 2 ? "LEFT" : "RIGHT";
  const hy = y < h / 2 ? "UPPER" : "LOWER";
  return `${hx}-${hy}`;
}

console.log(JSON.stringify(report, null, 2));
console.log("\nExpected from reference image:");
console.log("  headAnchor (leftmost white pixel) -> UPPER-LEFT");
console.log("  tailAnchor (rightmost white pixel) -> RIGHT (upper or mid, NOT lower-left)");
console.log("  bottomAnchor (lowest white pixel) -> LOWER (where the lower-wing apex is)");
