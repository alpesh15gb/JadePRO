// fix-function-type.mjs  -  drop `Type:` from [Function: ...] blocks
// -----------------------------------------------------------------------------
// WHY
//   Tally rejected the bundle with:
//       error T0014: Incorrect attribute 'Type' is used for the definition
//       'Function'.
//   `Type:` is an attribute of Variable, Field and Object definitions. A
//   Function declares its result through `Returns:` instead.
//
// SAFETY
//   Every one of the 259 functions carries BOTH `Type:` and `Returns:`, so
//   nothing loses type information: `Returns: Number : Any` already states the
//   result type. Verified before applying.
//
// SCOPE
//   Only lines inside a [Function: ...] block are touched. `Type:` on
//   [Variable: ...], Field and Object definitions is valid and preserved.
//
// usage: node fix-function-type.mjs <tdl-dir>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node fix-function-type.mjs <tdl-dir>");
  process.exit(2);
}

const isFnStart = (l) => /^\[Function:/.test(l.trim());
// A column-0, non-blank, non-comment line that is not the Function header
// closes the block - that is where the next definition begins.
const endsBlock = (l) =>
  l.length > 0 && !/^\s/.test(l) && !l.trim().startsWith(";") && !isFnStart(l);

let removed = 0, files = 0, preserved = 0;

for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl")).sort()) {
  const p = join(dir, f);
  const lines = readFileSync(p, "utf8").split(/\r?\n/);
  const out = [];
  let inFn = false;
  let touched = false;

  for (const line of lines) {
    if (isFnStart(line)) { inFn = true; out.push(line); continue; }
    if (inFn && endsBlock(line)) { inFn = false; out.push(line); continue; }
    if (inFn && /^\s*Type:\s*\S/.test(line)) { removed++; touched = true; continue; }
    if (/^\s*Type:\s*\S/.test(line)) preserved++;   // Variable / Field / Object
    out.push(line);
  }
  if (touched) { writeFileSync(p, out.join("\n"), "utf8"); files++; }
}

console.log("Type: lines removed from Function blocks :", removed, "in", files, "file(s)");
console.log("Type: lines preserved elsewhere           :", preserved, "(Variable/Field/Object - valid)");