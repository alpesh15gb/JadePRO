// Verifies the bracketing migration: every top-level definition must now be
// wrapped in [ ], bracket depth must balance across each file, and no
// attribute line (Print:, Part:, Export:, Keys:, End:) may have been bracketed.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
// `Alter` is NOT a definition type. Tally raised, against JadePro.tdl line 1254:
//
//     error T0006: The definition type is misspelt or incorrect.
//
// for `[Alter: Company]` -- i.e. it parsed the bracketed word as a definition and
// did not recognise it as one. It also agrees with the published definition-type
// list, which does not contain `Alter`. The correct form is the unbracketed
// statement `Alter: Company` (optionally `Alter: Object, Field-Group`), so Alter
// is listed as a STATEMENT below and is guarded in BOTH directions: it must stay
// unbracketed, and nothing else may claim to be one.
const STATEMENTS = ["Alter"];
const DEFS = ["Function", "Variable", "Collection", "Style", "Screen", "Report",
  "Barcode", "Object", "Type", "Import", "Button", "Key",
  // Confirmed by inspection of 01_Main.tdl: each of these opens its OWN
  // definition (the body holds a Lines: layout, which a Report lacks), so they
  // are bracketed too. Indented occurrences remain plain attributes.
  "Print", "Part", "Export", "Keys"];
// `End:` is not a TDL keyword and must never appear at all.
const FORBIDDEN = ["End"];

let bareDefs = 0, bareAttrs = 0, bracketed = 0, depthBad = 0, doubled = 0, bracketedStmt = 0;
const problems = [];

for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl")).sort()) {
  const lines = readFileSync(join(dir, f), "utf8").split(/\r?\n/);
  let depth = 0;
  for (const [i, raw] of lines.entries()) {
    const t = raw.trim();
    if (/^\s/.test(raw) || !t || t.startsWith(";")) continue;
    const head = /^([A-Za-z][A-Za-z0-9]*):/.exec(t);
    // A statement that got bracketed is the T0006 regression - catch it explicitly.
    const stmtBracketed = /^\[\s*([A-Za-z][A-Za-z0-9]*):/.exec(t);
    if (stmtBracketed && STATEMENTS.includes(stmtBracketed[1])) {
      bracketedStmt++;
      problems.push(`${f}:${i + 1} ${stmtBracketed[1]}: is a statement, must NOT be bracketed: ${t}`);
    }
    if (head && DEFS.includes(head[1]) && !t.startsWith("[")) {
      bareDefs++; problems.push(`${f}:${i + 1} unbracketed ${t}`);
    }
    if (head && FORBIDDEN.includes(head[1])) {
      bareAttrs++; problems.push(`${f}:${i + 1} invalid top-level keyword "${head[1]}"`);
    }
    if (/^\[[^\]]*\]/.test(t)) bracketed++;
    if (/^\[\s*\[/.test(t)) { doubled++; problems.push(`${f}:${i + 1} double-bracketed: ${t}`); }
  }
  // depth ignoring brackets that appear inside quoted strings
  for (const raw of lines) {
    const code = raw.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    depth += (code.match(/\[/g) || []).length - (code.match(/\]/g) || []).length;
    if (depth < 0) { depthBad++; problems.push(`${f}: negative depth on: ${raw.trim()}`); break; }
  }
  if (depth !== 0) { depthBad++; problems.push(`${f}: ends at depth ${depth}`); }
}

console.log("bracketed definition lines :", bracketed);
console.log("unbracketed definitions    :", bareDefs, bareDefs ? "(BAD)" : "(good)");
console.log("invalid top-level keywords :", bareAttrs, bareAttrs ? "(BAD)" : "(good)");
console.log("double-bracketed           :", doubled, doubled ? "(BAD)" : "(good)");
console.log("bracketed statements       :", bracketedStmt, bracketedStmt ? "(BAD)" : "(good)");
console.log("files with bad depth       :", depthBad, depthBad ? "(BAD)" : "(good)");
problems.slice(0, 10).forEach((p) => console.log("   !", p));
const ok = !bareDefs && !bareAttrs && !doubled && !depthBad && !bracketedStmt;
console.log(ok ? "BRACKETING VERIFIED." : "BRACKETING NOT VERIFIED.");
process.exit(ok ? 0 : 1);