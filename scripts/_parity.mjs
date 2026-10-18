import fs from "node:fs";
const en = JSON.parse(fs.readFileSync("d:/KhaiDai/khaidai/messages/en.json", "utf8"));
const bn = JSON.parse(fs.readFileSync("d:/KhaiDai/khaidai/messages/bn.json", "utf8"));
const enSet = new Set();
const bnSet = new Set();
function walk(o, p, set) {
  for (const k of Object.keys(o)) {
    const path = p ? `${p}.${k}` : k;
    if (typeof o[k] === "object" && o[k] !== null) walk(o[k], path, set);
    else set.add(path);
  }
}
walk(en, "", enSet);
walk(bn, "", bnSet);
const onlyEn = [...enSet].filter((x) => !bnSet.has(x));
const onlyBn = [...bnSet].filter((x) => !enSet.has(x));
console.log("en leaves:", enSet.size, "bn leaves:", bnSet.size);
console.log("only in en:", onlyEn.length, onlyEn.slice(0, 30).join("|"));
console.log("only in bn:", onlyBn.length, onlyBn.slice(0, 30).join("|"));