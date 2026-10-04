// bracket-definitions.mjs  -  wrap top-level TDL definitions in [ ]
// -----------------------------------------------------------------------------
// WHY
//   The official TDL Reference states: "All definitions start with an open
//   square bracket and end with a closed bracket", with the syntax
//       [<Definition Type> : <Definition Name>]
//   An unbracketed top-level definition is parsed as an attribute with no
//   owning definition, which Tally rejects with
//       T0027: The attribute definition started without a valid definition.
//
//   JadePro was written almost entirely in the unbracketed style - 611
//   definitions vs 221 already-bracketed. T0027 fired on the first one
//   (Function: JpAppName at line 66) exactly as predicted.
//
// WHAT IT CHANGES
//   Only lines at column 0 whose first token is a definition keyword and that
//   are not already inside [ ]. Attribute lines (Print:, Part:, Export:,
//   Keys:, End:), comments, blank lines and continuation lines are untouched.
//
//   Function: JpFineness        ->   [Function: JpFineness]
//   Variable: JpUserName : String -> [Variable: JpUserName : String]
//   Collection: Data: X         ->   [Collection: Data: X]
//   Alter: X                    ->   [Alter: X]
//
// usage: node bracket-definitions.mjs <tdl-dir>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node bracket-definitions.mjs <tdl-dir>");
  process.exit(2);
}

// Definition keywords that may legally start a top-level TDL definition.
const DEFS = [
  "Function", "Variable", "Collection", "Style", "Screen", "Report",
  "Alter", "Barcode", "Object", "Type", "Import", "Button", "Key",
];

const isDefStart = (line) => {
  if (/^\s/.test(line)) return false;          // must be column 0
  if (line.startsWith(";") || line.startsWith("[")) return false;
  const m = /^([A-Za-z][A-Za-z0-9]*):/.exec(line);
  return !!m && DEFS.includes(m[1]);
};

let changedFiles = 0, bracketed = 0;
const perKeyword = {};

for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl")).sort()) {
  const p = join(dir, f);
  const lines = readFileSync(p, "utf8").split(/\r?\n/);
  const out = lines.map((line) => {
    if (!isDefStart(line)) return line;
    bracketed++;
    const kw = /^([A-Za-z][A-Za-z0-9]*):/.exec(line)[1];
    perKeyword[kw] = (perKeyword[kw] || 0) + 1;
    return "[" + line + "]";
  });
  if (out.some((l, i) => l !== lines[i])) {
    writeFileSync(p, out.join("\n"), "utf8");
    changedFiles++;
  }
}

console.log("bracketed definitions :", bracketed, "in", changedFiles, "file(s)");
for (const [k, v] of Object.entries(perKeyword).sort((a, b) => b[1] - a[1])) {
  console.log("   " + k.padEnd(12), v);
}