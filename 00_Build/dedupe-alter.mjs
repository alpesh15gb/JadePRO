import { readFileSync, writeFileSync } from "node:fs";

/**
 * TDL forbids two sections with the same name, so `Alter: X` may appear only
 * once per module. This merges duplicate top-level `Alter:` blocks by moving the
 * body of each later duplicate to the end of the first occurrence.
 *
 * usage: node dedupe-alter.mjs <file>
 */
const file = process.argv[2];
const SECTION = /^(Alter:|Collection:|Report:|Print:|Export:|Screen:|Part:|Function:|Variable:|Constant:|Style:|Menu:|Keys:|Barcode:|End:|\[[A-Za-z])/;

const blockEnd = (lines, start) => {
  for (let j = start + 1; j < lines.length; j++) {
    if (SECTION.test(lines[j])) return j - 1;
  }
  return lines.length - 1;
};

let lines = readFileSync(file, "utf8").split(/\r?\n/);
let total = 0;

for (let guard = 0; guard < 50; guard++) {
  const seen = new Map();
  let dupIndex = -1, dupName = null;
  lines.forEach((l, i) => {
    const m = /^Alter:\s+(.+?)\s*$/.exec(l);
    if (!m) return;
    if (seen.has(m[1])) { dupIndex = i; dupName = m[1]; }
    else seen.set(m[1], i);
  });
  if (dupIndex === -1) break;

  const firstIndex = seen.get(dupName);
  const dupEnd = blockEnd(lines, dupIndex);
  let body = lines.slice(dupIndex + 1, dupEnd + 1);
  while (body.length && body[body.length - 1].trim() === "") body.pop();

  lines.splice(dupIndex, dupEnd - dupIndex + 1);
  const firstEnd = blockEnd(lines, firstIndex);
  lines.splice(firstEnd + 1, 0, ...body);
  total++;
  console.log(`  merged duplicate "Alter: ${dupName}"`);
}

if (total) {
  writeFileSync(file, lines.join("\n"), "utf8");
  console.log(`${file}: ${total} duplicate Alter block(s) merged`);
} else {
  console.log(`${file}: no duplicate Alter blocks`);
}