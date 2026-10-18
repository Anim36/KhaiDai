// Read the JSON report and print a compact summary of the deep
// findings so we can see which pages are flagged and what they
// look like without paging through the full report file.
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('docs/responsive-audit.json', 'utf8'));
console.log('OVERFLOWS     :', r.summary.overflows);
console.log('CONSOLE ERR   :', r.summary.consoleErrors);
console.log('TINY TARGETS  :', r.summary.tinyTargetRatios);
console.log('CLIPPED PAGES :', r.summary.clippedTextPages);
console.log('OVERLAP PAGES :', r.summary.overlapPages);
console.log('FIXED ESC     :', r.summary.fixedEscapePages);
console.log('---CLIPPED---');
for (const x of r.clippedText.slice(0, 8)) {
  console.log(x.url, '@', x.width, '(' + x.count + ')');
  for (const s of x.samples.slice(0, 2))
    console.log('  <' + s.tag + '> sw=' + s.scrollW + ' cw=' + s.clientW + ' "' + s.text.slice(0, 40) + '"  .' + s.classList.slice(0, 60));
}
console.log('---OVERLAP---');
for (const x of r.overlaps.slice(0, 8)) {
  console.log(x.url, '@', x.width, '(' + x.count + ')');
  for (const s of x.samples.slice(0, 2)) {
    console.log('  ' + s.a);
    console.log('  ' + s.b);
  }
}
console.log('---FIXED-ESC---');
for (const x of r.fixedEscape.slice(0, 8)) {
  console.log(x.url, '@', x.width, '(' + x.count + ')');
  for (const s of x.samples.slice(0, 3))
    console.log('  ' + s.position + ' <' + s.tag + '> left=' + s.left + ' right=' + s.right + ' w=' + s.width + ' vw=' + s.vw + '  .' + s.classList);
}
console.log('---TINY---');
for (const x of r.tinyTargetRatios.slice(0, 8))
  console.log(x.url, '@', x.width, 'tiny=' + x.tiny + '/' + x.total, '(' + Math.round(x.ratio * 100) + '%)');
console.log('---CONSOLE---');
for (const x of r.consoleErrors.slice(0, 8)) {
  console.log(x.url, '@', x.width);
  for (const e of x.errors.slice(0, 2)) console.log('  ' + e.slice(0, 200));
}
console.log('---OVERFLOWS---');
for (const x of r.overflows) console.log(x.url, '@', x.width, '+' + x.overflow);
