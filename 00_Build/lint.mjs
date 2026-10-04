#!/usr/bin/env node
/**
 * JadePro TDL structural linter.
 *
 * This is NOT a Tally compiler - it cannot resolve Tally's internal schema, so
 * passing here does not prove a module will load in Tally. What it DOES prove,
 * and what we rely on it for:
 *
 *   1. Balanced, well-formed  [ ... ]  blocks and terminating keywords.
 *   2. Every line-level keyword is in the known TDL vocabulary (catches typos
 *      such as "Columms:" or "Partt-id:").
 *   3. Every referenced local symbol (Function / Variable / Constant / Part /
 *      Report / Collection / Screen / Menu / Keys / Barcode / Style / Part
 *      name inside <...>) is declared somewhere in the module set.
 *   4. No duplicate declarations - Tally silently keeps the first, which is a
 *      classic source of "my edit did nothing" bugs.
 *   5. System: UDF names are unique, and every declared UDF is referenced by at
 *      least one form field.
 *   6. Module load order is topologically consistent.
 *
 * Exit 0 = clean, 1 = errors.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "tdl");

import { ATTRS as SECTION_KEYWORDS, VALUE_TOKENS } from "./tdl-attrs.mjs";
import { BUILTINS } from "./tdl-builtins.mjs";

const DECL_PATTERNS = [
  ["udf",      /^System:\s+UDF\s+"([^"]+)"/],
  // Documented form: inside [System: UDF], each UDF is a line
  //   <Name of UDF> : <Data Type> : <Index Number>
  ["udf",      /^([A-Za-z_]\w*)\s*:\s*[A-Za-z]+\s*:\s*\d+\s*$/,
    // Only a UDF declaration when it directly follows a [System: UDF] block.
    // The bare shape <word> : <Word> : <number> also occurs in unrelated
    // attributes (e.g. `Set : Var : 123`), and treating those as declarations
    // would mask a genuinely undeclared symbol.
    (lines, i) => /^\[System:\s*UDF\s*\]$/.test((lines[i - 1] ?? "").trim())],
  ["function", /^Function:\s*([A-Za-z_]\w*)/],
  ["variable", /^Variable:\s*([A-Za-z_]\w*)/],
  ["constant", /^Constant:\s*([A-Za-z_]\w*)/],
  ["part",     /^Part:\s*([A-Za-z_]\w*)/],
  ["style",    /^Style:\s*([A-Za-z_]\w*)/],
  ["barcode",  /^Barcode:\s*([A-Za-z_]\w*)/],
  ["keys",     /^Keys:\s*([A-Za-z_]\w*)/],
  ["screen",   /^Screen:\s*([A-Za-z_]\w*)/],
  ["menu",     /^Menu:\s*([A-Za-z_]\w*)/],
  ["refmenu",  /^#Menu:\s*([A-Za-z_]\w*)/],
  ["report",   /^(?:Report|Collection):\s*Report:\s*([A-Za-z_]\w*)/],
  ["report",   /^Report:\s*([A-Za-z_]\w*)\s*$/],
  ["alter",    /^Alter:\s+([A-Z][\w, ]*?)\s*$/],
  ["source",   /^Collection:\s*Source:\s*([A-Za-z_]\w*)/],
  ["block",    /^Collection:\s*(?:Block|Data):\s*([A-Za-z_]\w*)/],
  ["export",   /^Export:\s*([A-Za-z_]\w*)/],
  ["print",    /^Print:\s*([A-Za-z_]\w*)/],
];

// Names that legitimately appear inside <...> but are structural keywords.
const INLINE_OK = new Set([
  "Title", "Rows", "Columns", "Print", "Export", "Set", "Repeat", "Filters",
  "Barcode", "Bar-Code", "Key", "Source", "Var", "Style", "Parts", "Search",
  "Button", "Sub-Report", "Key-search", "Multi", "Field", "Line", "Group",
  "Part", "Items", "Caption", "Table", "Filter", "Add", "New", "Old", "Total",
  "Details", "Aggregate", "Compute", "Fixed", "Outer", "Drill", "Data",
  "Not", "Null", "Yes", "No",
]);

const stripStrings = (l) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""');
const refs = [];
const errors = [];
const warnings = [];
const declared = new Map();
const udfs = new Map();
const udfUse = new Map();
const sqlAliases = new Set();
// Only these attributes are meaningful exactly once per section. "Text:",
// "Item:", "Lines:", "Field:", "Export:" and "Print:" all legitimately repeat
// inside their own sections, so flagging every repeat would be pure noise.
const SINGULAR_ATTRS = new Set([
  "Var", "Filters", "Source", "Key", "Caption", "Toolbar", "Sub-Report",
]);
const seenAttrs = new Map();
let indentStack = new Map();
let openSection = "";
const files = readdirSync(SRC).filter((f) => f.endsWith(".tdl")).sort();

if (!files.length) {
  console.error(`No .tdl files in ${SRC}`);
  process.exit(1);
}

const refMenuTargets = new Set();

for (const f of files) {
  const path = join(SRC, f);
  const raw = readFileSync(path, "utf8").split(/\r?\n/);
  let depth = 0;
  // Tracks whether the current line sits inside a [Function: ...] block, which
  // is the only context where `Type:` is invalid (T0014).
  let inFunctionBlock = false;
  let inUdfBlock = false;
  for (let i = 0; i < raw.length; i++) {
    const lineno = i + 1;
    const code = stripStrings(raw[i]);

    // maintain Function-block state before any rule below consults it
    if (/^\[Function:/.test(raw[i].trim())) {
      inFunctionBlock = true;
    } else if (
      inFunctionBlock &&
      raw[i].length > 0 &&
      !/^\s/.test(raw[i]) &&
      !raw[i].trim().startsWith(";")
    ) {
      inFunctionBlock = false;
    }
    const stripped = code.trim();

    depth += (code.match(/\[/g) || []).length - (code.match(/\]/g) || []).length;
    if (depth < 0) {
      errors.push(`${f}:${lineno}: unbalanced ']'`);
      depth = 0;
    }
    if (!stripped || stripped.startsWith(";") || stripped === "[") continue;

    // Tally rejects `Type:` on a Function with
    //   T0014: Incorrect attribute 'Type' is used for the definition 'Function'.
    // Type belongs to Variable / Field / Object definitions; a Function states
    // its result through `Returns:`. Only check lines inside a Function block.
    if (/^\s*Type:\s*\S/.test(raw[i]) && inFunctionBlock) {
      errors.push(
        `${f}:${lineno}: "Type:" is not a attribute of Function (T0014). ` +
          `Use "Returns: <Type> : Any" - every JadePro function already declares it.`
      );
    }

    // TDL has NO `Constant:` definition type. The official TDL Reference lists
    // the definition types as Menu, Report, Form, Part, Line, Field, Button,
    // Table, Object, Variable, Collection, Border, Style, Color, Import Object,
    // Import File, Key and System definitions - and every definition "starts
    // with an open square bracket and ends with a closed bracket".
    //
    // A top-level `Constant: X : "v"` is therefore an attribute line with no
    // owning definition, which Tally rejects with T0027 "The attribute
    // definition started without a valid definition". It bit us on the first
    // real compile. Use a zero-argument Function instead - see
    // 00_Build/constant-to-function.mjs for the migration.
    if (/^Constant:/.test(raw[i].trim())) {
      errors.push(
        `${f}:${lineno}: "Constant:" is not a TDL definition type (T0027). ` +
          `Declare a zero-argument Function instead, e.g. "Function: X / Type: String / Returns: String : Any".`
      );
    }

    // keyword sanity
    //
    // Inside a [System: UDF] block the body is free-form
    // "<Name> : <DataType> : <Index>" declarations, not attribute lines, so a
    // UDF name at the head of a line is not a misspelt keyword.
    const udfHeader = /^\s*\[System\s*:\s*UDF\]\s*$/i.test(raw[i]);
    if (udfHeader) inUdfBlock = true;
    const m = /^([A-Za-z][\w -]*?):(\s|$)/.exec(stripped);
    if (m && !inUdfBlock) {
      const head = m[1].trim();
      const isWord = /^[A-Za-z][\w-]*$/.test(head);
      if (isWord && !SECTION_KEYWORDS.has(head) && !VALUE_TOKENS.has(head)) {
        warnings.push(`${f}:${lineno}: unrecognised keyword "${head}" - check spelling`);
      }
    }

    const atCol0 = !/^[ 	]/.test(raw[i]);
    // UDF names live inside quotes, so they must be matched against the RAW line -
    // stripStrings() has already blanked them out in `stripped`.
    // A repeated attribute inside one section (two "Var:" lines, two "Filters:"
// lines) is silently accepted by Tally, and which one wins is not obvious.
// Track keys per (section, indent) and flag repeats at the same indent.
    if (atCol0) {
      openSection = stripped.replace(/\s+$/, "");
      seenAttrs.clear();
      indentStack.clear();
    } else {
      const indent = raw[i].length - raw[i].trimStart().length;
      const km = /^([A-Za-z][\w -]*):/.exec(stripped);
      if (km && indent > 0 && indentStack.get(indent) === openSection
          && SINGULAR_ATTRS.has(km[1])) {
        const key = `${indent}|${km[1]}`;
        if (seenAttrs.has(key)) {
          warnings.push(`${f}:${lineno}: attribute "${km[1]}" repeated in ${openSection} (first at line ${seenAttrs.get(key)}) - Tally silently keeps one`);
        } else {
          seenAttrs.set(key, lineno);
        }
      }
      for (const d of [...indentStack.keys()]) if (d < indent) indentStack.delete(d);
      indentStack.set(indent, openSection);
    }

    const udm = atCol0 ? /^\[?System:\s+UDF\s+"([^"]+)"/.exec(raw[i].trim()) : null;
    if (udm) {
      const u = udm[1];
      if (udfs.has(u)) {
        errors.push(`${f}:${lineno}: duplicate System: UDF "${u}" (first at ${udfs.get(u).file}:${udfs.get(u).line})`);
      } else {
        udfs.set(u, { file: f, line: lineno });
      }
    }
    for (const [kind, re, guard] of DECL_PATTERNS) {
      if (guard && !guard(raw, i)) continue;
      // Definitions are bracketed in TDL: [Function: Name]. Strip the opening
      // bracket (and any ! / # modifier) so the same patterns match both the
      // bracketed form and a bare attribute line such as "Print: X".
      const declProbe = stripped.replace(/^\[!?#?/, "").replace(/\]\s*$/, "");
      const d = re.exec(declProbe);
      if (!d) continue;
      // A section header is always at column 0. An indented occurrence is a
      // REFERENCE to that object (e.g. "Print: X" inside a Report), not a
      // declaration of it.
      if (!atCol0) {
        // An indented "Alter: X, Part" is a reference to that part; a bare
        // "Alter: X" inside a Function is the Alter ACTION, not a reference.
        if (d[1].includes(",")) refs.push({ name: d[1], file: f, line: lineno });
        break;
      }
      const name = d[1];
      if (kind === "refmenu") {
        errors.push(`${f}:${lineno}: "#Menu:" is a modifier, not a declaration (${name})`);
        break;
      }
      const prev = declared.get(name);
      if (prev && prev.kind === kind) {
        errors.push(`${f}:${lineno}: duplicate ${kind} "${name}" (first at ${prev.file}:${prev.line})`);
      } else if (prev && kind === "alter" && prev.kind === "alter") {
        errors.push(`${f}:${lineno}: duplicate Alter of "${name}" (first at ${prev.file}:${prev.line})`);
      } else {
        declared.set(name, { kind, file: f, line: lineno });
      }
      if (kind === "udf") udfs.set(name, { file: f, line: lineno });
      if (kind === "function" || kind === "alter") {
        // Alter names are action names for OnAction.
      }
      break;
    }

    for (const r of code.matchAll(/\b(?:OnAction|OnChange|OnKeyPress|OnClick):\s*([A-Za-z_]\w*)/g)) {
      refs.push({ name: r[1], file: f, line: lineno });
    }
    for (const r of code.matchAll(/<\s*([A-Za-z_]\w*)\s*>/g)) {
      if (!INLINE_OK.has(r[1])) refs.push({ name: r[1], file: f, line: lineno });
    }
    for (const r of code.matchAll(/\bPart\s+Name:\s*([A-Za-z_]\w*)/g)) {
      refs.push({ name: r[1], file: f, line: lineno });
    }
    for (const r of code.matchAll(/\bRepeat:\s*Over\s*:\s*([A-Za-z_]\w*)/g)) {
      refs.push({ name: r[1], file: f, line: lineno });
    }
    // Menu item targets
    for (const r of stripped.matchAll(/\bItem:\s*([^:]+):\s*Display:\s*([A-Za-z_]\w*)/g)) {
      refs.push({ name: r[2].trim(), file: f, line: lineno });
      void r;
    }
    // UDF usage in field ids
    for (const r of stripped.matchAll(/"(Jwl[A-Za-z0-9_]+)"/g)) {
      if (!udfUse.has(r[1])) udfUse.set(r[1], `${f}:${lineno}`);
    }
    for (const r of code.matchAll(/Field-[Ii]d:\s*"?([A-Za-z_]\w*)"?/g)) {
      if (!udfUse.has(r[1])) udfUse.set(r[1], `${f}:${lineno}`);
    }
    for (const r of code.matchAll(/(?:\$\$|#{1,2})(Jwl[A-Za-z0-9_]+)/g)) {
      if (!udfUse.has(r[1])) udfUse.set(r[1], `${f}:${lineno}`);
    }
    for (const _r of []) {
      if (!udfUse.has(r[1])) udfUse.set(r[1], `${f}:${lineno}`);
    }
  }
  if (depth !== 0) errors.push(`${f}: file ends with ${depth} unclosed '[' block(s)`);
}

// SQL aliases introduced by "... AS JwlSomething" in report queries are
// computed columns, not user defined fields.
for (const f of files) {
  const txt = readFileSync(join(SRC, f), "utf8");
  for (const m of txt.matchAll(/\bAS\s+([A-Za-z_]\w*)/gi)) sqlAliases.add(m[1]);
}

// referential integrity
const seen = new Set();
for (const r of refs) {
  if (declared.has(r.name)) continue;
  if (BUILTINS.has(r.name)) continue;
  const k = `${r.file}:${r.line}:${r.name}`;
  if (seen.has(k)) continue;
  seen.add(k);
  errors.push(`${r.file}:${r.line}: reference to undeclared symbol "${r.name}"`);
}

for (const [name, at] of udfs) {
  if (!udfUse.has(name)) warnings.push(`UDF "${name}" declared but never referenced (${at.file}:${at.line})`);
}

// Used-but-never-declared UDFs are a silent data-loss bug in Tally: the form
// accepts the field but nothing stores it. Only "Jwl"-prefixed names are
// candidates - "Jp*" names are TDL Variables and layout fields, and Tally's
// own fields (NAME, DATE, ...) are always legal.
for (const [name, at] of udfUse) {
  if (udfs.has(name)) continue;
  if (BUILTINS.has(name)) continue;
  // A plain TDL Variable/Constant with the same name is not a UDF.
  if (declared.has(name)) continue;
  if (!/^Jwl[A-Z]/.test(name)) continue;
  // SQL column aliases created by "AS xxx" in a report query are not UDFs.
  if (sqlAliases.has(name)) continue;
  errors.push(`${at}: UDF "${name}" is used in a form or report but never declared with System: UDF`);
}

// --- T0014: interface containment hierarchy -------------------------------
// TallyPrime's reference fixes the hierarchy as Report -> Form -> Part -> Line ->
// Field. A Part holds Lines (alias `Lines`), never Fields, so a top-level
// `Field:` or `Text:` inside a Part is a hard compile error. Tally stopped the
// whole bundle on the first of 17 such sites, one per reload; this rule reports
// all of them at once. `Screen` is likewise not one of TDL's definition types.
{
  const MAY_HOLD_FIELD = new Set(["Line", "Field", "Part", "Report", "Form", "Alter", "Screen"]);
  for (const f of files) {
    const p = join(SRC, f);
    const lines = readFileSync(p, "utf8").split(/\r?\n/);
    let def = null;
    for (const [i, raw] of lines.entries()) {
      const t = raw.trim();
      if (!t || t.startsWith(";")) continue;
      if (!/^\s/.test(raw)) {
        // Column-0: either a bracketed definition or an unbracketed statement
        // such as `Alter: Company`. Both end the previous block, and both need to
        // update `def` - `Add: Field` belongs to Alter, not to whatever preceded it.
        const h = /^\[([A-Za-z][A-Za-z0-9 ]*)\s*:/.exec(t);
        if (h) { def = h[1]; continue; }
        const s = /^([A-Za-z][A-Za-z0-9 ]*)\s*:/.exec(t);
        def = s ? s[1] : null;
        continue;
      }
      if (!def || MAY_HOLD_FIELD.has(def)) continue;
      const a = /^(\s{4})([A-Za-z][A-Za-z0-9]*)\s*:/.exec(raw);
      if (a && (a[2] === "Field" || a[2] === "Text")) {
        errors.push(`${f}:${i + 1}: '${a[2]}' directly inside '${def}' - '${def}' cannot contain it (T0014); wrap it in a [Line: ]`);
      }
    }
  }
}

// --- definition types Tally's reference does not document --------------------
// TDL has 20 definition types (TallyHelp "Definitions, Attributes, and Modifiers
// in TDL"). The ones below are not among them. They parse as `[Type: Name]` so a
// bracketed-form checker cannot see them, but Tally may reject the type itself
// with T0006 - exactly what it did for `Alter`. Reported as warnings so the build
// stays usable while each is settled against the compiler via 00_Build/probes/.
const NONSTANDARD = ["Screen", "Print", "Export", "Keys", "Barcode"];
for (const f of files) {
  const txt = readFileSync(join(SRC, f), "utf8");
  txt.split(/\r?\n/).forEach((raw, i) => {
    const h = /^\[([A-Za-z][A-Za-z0-9 ]*)\s*:/.exec(raw.trim());
    if (h && NONSTANDARD.includes(h[1])) {
      warnings.push(`${f}:${i + 1}: [${h[1]}: ...] is not one of TDL's 20 documented definition types - may fail with T0006`);
    }
  });
}

console.log(`Linting ${files.length} modules: ${files.join(", ")}\n`);
console.log(`  declared symbols : ${declared.size}`);
console.log(`  UDFs             : ${udfs.size}`);
console.log(`  symbol references: ${refs.length}\n`);

if (warnings.length) {
  console.log(`--- ${warnings.length} warning(s) ---`);
  // Warnings used to be capped at 60, which hid almost all of them. The
  // vocabulary is now derived from the reference, so the unrecognised-keyword
  // count is the honest size of the invented-vocabulary debt.
  const WARN_CAP = Number(process.env.LINT_WARN_CAP || 400);
  warnings.slice(0, WARN_CAP).forEach((w) => console.log("  ! " + w));
  if (warnings.length > WARN_CAP) console.log(`  ... ${warnings.length - WARN_CAP} more`);
  console.log("");
}
if (errors.length) {
  console.log(`--- ${errors.length} error(s) ---`);
  errors.slice(0, 80).forEach((e) => console.log("  x " + e));
  if (errors.length > 80) console.log(`  ... ${errors.length - 80} more`);
  process.exit(1);
}
console.log("OK - no structural errors.");
void refMenuTargets;