// scripts/flip-detect-bkash.js — confirm the regenerated icon is
// NOT horizontally mirrored by comparing the white-pixel
// distribution of the left half vs. the right half.
//
// If the icon were mirror-flipped, the leftmost white pixels would
// be on the RIGHT side instead of the LEFT.

const fs = require("fs");
const { Resvg } = require("@resvg/resvg-js");

const SRC = "d:/KhaiDai/khaidai/public/icons/bkash-logo.svg";
const svg = fs.readFileSync(SRC, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 256 },
  background: "rgba(0,0,0,0)",
});
const rendered = resvg.render();
const w = rendered.width,
  h = rendered.height;
const px = rendered.pixels;

const isWhite = (i) => px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240;

let leftCount = 0,
  rightCount = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!isWhite(i)) continue;
    if (x < w / 2) leftCount++;
    else rightCount++;
  }
}

const totalWhite = leftCount + rightCount;
const leftPct = ((leftCount / totalWhite) * 100).toFixed(1);
const rightPct = ((rightCount / totalWhite) * 100).toFixed(1);

console.log(`White pixel distribution in 256×256 render:`);
console.log(`  LEFT half:  ${leftPct}%`);
console.log(`  RIGHT half: ${rightPct}%`);

// Reference image: head (small) + body (large) are on the LEFT,
// tail (small) is on the RIGHT. So the LEFT half should contain
// significantly more white pixels (the body+head) than the right
// (just the tail wedge).
if (leftCount > rightCount) {
  console.log(
    `\n✓ Correct orientation: head+body mass is on the LEFT (matches reference image).`
  );
} else {
  console.log(
    `\n✗ Wrong orientation: head+body mass is on the RIGHT (image is mirrored).`
  );
  process.exit(1);
}
