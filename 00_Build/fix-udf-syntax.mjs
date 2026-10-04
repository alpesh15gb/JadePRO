// fix-udf-syntax.mjs  -  correct the User Defined Field declarations and prefix
// -----------------------------------------------------------------------------
// WHY
//   Tally rejected the bundle with:
//       error T0011: The system definition type 'UDF "JwlJadeProOn"' is invalid.
//
//   Tally parsed the whole bracket contents as the *definition type*, so the
//   name must not live inside `[System: UDF ...]`. The documented form is:
//
//       [System: UDF]
//       <Name of UDF> : <Data Type> : <Index Number>
//
//   Two further corrections follow from the same reference:
//     * `Text` is not a Tally data type. The valid set is String, Amount,
//       Quantity, Rate, Number, Date, Rate of Exchange, Logical (and Aggregate).
//       All 83 `Text` declarations become `String`.
//     * A UDF is read with a SINGLE `$` prefix. `$$Name` is a Variable. Every
//       `$$JwlXxx` in TDL expression position therefore becomes `$JwlXxx`.
//
// HAZARD: SQL COLLECTION SYNTAX IS DIFFERENT
//   Inside a quoted SQL string, `$$JwlBarcode$$` is Tally's collection field
//   syntax and must stay exactly as it is. All rewriting therefore skips every
//   quoted literal; only TDL expression positions are touched.
//
// Index numbers are allocated sequentially from 20001. The reference reserves
// 1-29 for default TDL and 10000-20000 for TSPL; 20001+ is open for custom use.
//
// usage: node fix-udf-syntax.mjs <tdl-dir>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node fix-udf-syntax.mjs <tdl-dir>");
  process.exit(2);
}

const TYPE_MAP = { Text: "String" };   // the only invalid type in use
const INDEX_BASE = 20001;

// ---- pass 1: collect declarations in file order -------------------------
const decls = [];   // { name, type }
for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl")).sort()) {
  const lines = readFileSync(join(dir, f), "utf8").split(/\r?\n/);
  let pending = null;
  for (const line of lines) {
    const t = line.trim();
    const head = /^\[System:\s*UDF\s+"([^"]+)"\s*\]$/.exec(t);
    if (head) { pending = { name: head[1], type: null, label: null }; continue; }
    if (!pending) continue;
    if (!t) continue;
    if (/^Type:\s*/i.test(t)) {
      pending.type = TYPE_MAP[t.replace(/^Type:\s*/i, "").trim()] ?? t.replace(/^Type:\s*/i, "").trim();
      continue;
    }
    if (/^Label:/i.test(t)) { pending.label = t; continue; }
    // any other indented attribute closes the block
    if (/^\s/.test(line)) { decls.push(pending); pending = null; continue; }
    decls.push(pending); pending = null;
  }
  if (pending) decls.push(pending);
}

if (!decls.length) {
  console.error("no [System: UDF \"...\"] declarations found - nothing to do.");
  process.exit(1);
}

const names = new Set(decls.map((d) => d.name));
const index = new Map(decls.map((d, i) => [d.name, INDEX_BASE + i]));

console.log("UDF declarations found:", decls.length);
console.log("  Text -> String      :", decls.filter((d) => d.type === "String").length);
console.log("  index range         :", INDEX_BASE, "-", INDEX_BASE + decls.length - 1);

// ---- pass 2: rewrite -----------------------------------------------------
let declsRewritten = 0, refsRewritten = 0, files = 0;

for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl")).sort()) {
  const p = join(dir, f);
  const src = readFileSync(p, "utf8");
  const lines = src.split(/\r?\n/);
  const out = [];
  let pending = null, touched = false;

  const flush = () => {
    if (!pending) return;
    // emit documented form; keep the Label as a comment so the information
    // (and the human-readable description) is not lost.
    if (pending.label) out.push("    ; " + pending.label);
    out.push("[System: UDF]");
    out.push(`${pending.name} : ${pending.type} : ${index.get(pending.name)}`);
    pending = null;
    declsRewritten++;
    touched = true;
  };

  for (const line of lines) {
    const t = line.trim();
    const head = /^\[System:\s*UDF\s+"([^"]+)"\s*\]$/.exec(t);
    if (head) { flush(); pending = { name: head[1], type: null, label: null }; continue; }
    if (pending) {
      if (!t) continue;                                  // blank: keep collecting
      if (/^Type:\s*/i.test(t)) { pending.type = (TYPE_MAP[t.replace(/^Type:\s*/i, "").trim()] ?? t.replace(/^Type:\s*/i, "").trim()); continue; }
      if (/^Label:/i.test(t)) { pending.label = t; continue; }
      if (/^\s/.test(line)) { flush(); out.push(line); continue; }
      flush(); out.push(line); continue;
    }

    // Rewrite $$Name -> $Name outside quoted literals only.
    let res = "", i = 0, changed = false;
    while (i < line.length) {
      if (line[i] === '"') {                              // copy literal verbatim
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
    if (res !== line) {
      for (const n of names) {
        const before = res;
        res = res.split("$$" + n).join("$" + n);
        if (res !== before) { refsRewritten++; touched = true; }
      }
    }
    out.push(res);
  }
  flush();
  if (touched) { writeFileSync(p, out.join("\n"), "utf8"); files++; }
}

console.log("declarations rewritten:", declsRewritten, "in", files, "file(s)");
console.log("references $$ -> $     :", refsRewritten);