// convert-udf-prefix.mjs  -  $$Name -> $Name for declared UDFs
// -----------------------------------------------------------------------------
// WHY
//   A UDF is read with a SINGLE `$` prefix; `$$Name` addresses a Variable.
//   JadePro declared all 220 UDFs correctly but referenced them as variables.
//
// HAZARD
//   Inside a quoted SQL collection string, `$$JwlBarcode$$` is Tally's own
//   collection-field syntax and must remain exactly as written. Every quoted
//   literal is therefore copied byte-for-byte; only TDL expression positions
//   are rewritten.
//
// usage: node convert-udf-prefix.mjs <tdl-dir>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node convert-udf-prefix.mjs <tdl-dir>");
  process.exit(2);
}

// Declared UDF names, read back from the corrected declarations.
const names = new Set();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl"))) {
  for (const l of readFileSync(join(dir, f), "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z]+\s*:\s*\d+\s*$/.exec(l);
    if (m) names.add(m[1]);
  }
}
console.log("declared UDFs:", names.size);
if (!names.size) { console.error("no UDF declarations found"); process.exit(1); }

// longest first so no name is a prefix-match of another
const ordered = [...names].sort((a, b) => b.length - a.length);

let refs = 0, files = 0, sqlLeft = 0;

for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl")).sort()) {
  const p = join(dir, f);
  const lines = readFileSync(p, "utf8").split(/\r?\n/);
  let touched = false;
  const out = lines.map((line) => {
    let res = "", i = 0;
    while (i < line.length) {
      if (line[i] === '"') {                 // copy quoted literal verbatim
        let j = i + 1;
        while (j < line.length) {
          if (line[j] === "\\") { j += 2; continue; }
          if (line[j] === '"') { j++; break; }
          j++;
        }
        res += line.slice(i, j); i = j; continue;
      }
      res += line[i]; i++;
    }
    for (const n of ordered) {
      const needle = "$$" + n;
      if (res.includes(needle)) {
        const parts = res.split(needle);
        refs += parts.length - 1;
        res = parts.join("$" + n);
      }
    }
    if (res !== line) touched = true;
    return res;
  });
  const text = out.join("\n");
  sqlLeft += (text.match(/\$\$[A-Za-z_][A-Za-z0-9_]*\$\$/g) || []).length;
  if (touched) { writeFileSync(p, text, "utf8"); files++; }
}

console.log("references converted:", refs, "in", files, "file(s)");
console.log("SQL field refs preserved ($$Name$$):", sqlLeft);