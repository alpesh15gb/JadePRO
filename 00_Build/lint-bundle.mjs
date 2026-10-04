#!/usr/bin/env node
/**
 * Bundle verifier.
 *
 * The concatenated JadePro.tdl must satisfy the same structural rules as the
 * individual modules - most importantly that brackets balance across module
 * boundaries and that no two modules declare the same UDF (a duplicate UDF is
 * silently dropped by Tally, which produces the confusing symptom "I changed
 * the value and nothing happened").
 *
 * usage: node lint-bundle.mjs <path-to-JadePro.tdl>
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const file = process.argv[2];
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const errors = [];
const warnings = [];

let depth = 0;
const udfs = new Map();
const parts = [];
const seen = new Map();

lines.forEach((raw, i) => {
  const lineno = i + 1;
  const prevCode = (lines[i - 1] ?? "").trim();
  const code = raw.replace(/"(?:[^"\\]|\\.)*"/g, '""');

  const bm = /^;; >>>+ BEGIN (\S+) <<+/.exec(raw);
  if (bm) parts.push(bm[1]);

  depth += (code.match(/\[/g) || []).length - (code.match(/\]/g) || []).length;
  if (depth < 0) {
    errors.push(`${basename(file)}:${lineno}: unbalanced ']'`);
    depth = 0;
  }

  // Documented form: inside [System: UDF], each UDF is a line
  //   <Name of UDF> : <Data Type> : <Index Number>
  // Documented form: inside [System: UDF], each UDF is a line
  //   <Name of UDF> : <Data Type> : <Index Number>
  // Only meaningful directly inside a [System: UDF] block - the bare shape
  // <word> : <Word> : <number> also occurs in unrelated attributes.
  const udm =
    /^\[?System:\s+UDF\s+"([^"]+)"/.exec(raw.trim()) ||
    (/^\[System:\s*UDF\s*\]$/.test(prevCode)
      ? /^([A-Za-z_]\w*)\s*:\s*[A-Za-z]+\s*:\s*\d+\s*$/.exec(raw.trim())
      : null);
  if (udm) {
    const u = udm[1];
    if (udfs.has(u)) {
      errors.push(`${basename(file)}:${lineno}: duplicate UDF "${u}" (first at line ${udfs.get(u)})`);
    } else {
      udfs.set(u, lineno);
    }
  }

  // duplicate section names across the whole bundle.
  // Definitions are bracketed in TDL ([Function: Name]), so accept an optional
  // opening bracket and closing bracket, and allow spaces in definition names
  // such as "JpTally Barcode Screen".
  const sec = /^\[?([A-Za-z]+):\s*([A-Za-z_][\w ]*?)\s*\]?$/.exec(raw);
  // System definitions are exempt: the TDL Reference states "System Definitions
  // can be defined any number of times. The items defined are appended to the
  // existing list." Each [System: UDF] block declares one UDF, and JadePro has
  // 219 of them, so repeated System blocks are expected, not a duplicate.
  if (sec && !/^(Alter|System)$/.test(sec[1])) {
    const key = `${sec[1]}:${sec[2]}`;
    if (seen.has(key)) {
      errors.push(`${basename(file)}:${lineno}: duplicate section "${key}" (first at line ${seen.get(key)})`);
    } else {
      seen.set(key, lineno);
    }
  }
  const alter = /^\[?Alter:\s+(.+?)\s*\]?$/.exec(raw);
  if (alter) {
    const key = `Alter:${alter[1]}`;
    if (seen.has(key)) {
      errors.push(`${basename(file)}:${lineno}: duplicate section "${key}" (first at line ${seen.get(key)})`);
    } else {
      seen.set(key, lineno);
    }
  }
});

if (depth !== 0) errors.push(`${basename(file)}: ends with ${depth} unclosed '[' block(s)`);

// The module count is not hard-coded. Derive the expected set from tdl/ so
// that a module which exists but was forgotten in build.sh's ORDER array is
// caught here. A literal count silently rots the next time a module is added.
const srcDir = join(dirname(file), "tdl");

// Modules that legitimately live in tdl/ but are deliberately NOT bundled.
// Listing them here is the point: an omission stays deliberate and visible
// instead of becoming an accident nobody notices.
const OPTIONAL = new Set(["08c_BarcodeSection.tdl"]);

let expected = null;
try {
  expected = readdirSync(srcDir)
    .filter((f) => f.endsWith(".tdl") && !OPTIONAL.has(f))
    .sort();
} catch {
  warnings.push(`cannot read ${srcDir} - skipping module-set check`);
}
if (expected) {
  const bundled = new Set(parts);
  const missing = expected.filter((m) => !bundled.has(m));
  const extra = parts.filter((m) => !expected.includes(m));
  for (const m of missing) errors.push(`module ${m} exists in tdl/ but is NOT in the bundle (add it to ORDER in build.sh)`);
  for (const m of extra) errors.push(`bundle contains ${m}, which is not in tdl/`);
  if (!missing.length && !extra.length) {
    console.log(`  module set     : all ${expected.length} modules in tdl/ are bundled`);
  }
}

console.log(`  bundle sections : ${seen.size}`);
console.log(`  bundle UDFs     : ${udfs.size}`);
console.log(`  modules bundled : ${parts.length}`);

if (warnings.length) warnings.forEach((w) => console.log("  ! " + w));
if (errors.length) {
  console.log(`  --- ${errors.length} error(s) ---`);
  errors.slice(0, 40).forEach((e) => console.log("  x " + e));
  process.exit(1);
}
console.log("  OK - bundle is structurally sound.");