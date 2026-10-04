#!/usr/bin/env node
/**
 * constant-to-function.mjs  -  one-shot source migration
 * -----------------------------------------------------------------------------
 * TDL has no `Constant:` definition type. Per the official TDL Reference the
 * complete set of definition types is Menu, Report, Form, Part, Line, Field,
 * Button, Table, Object, Variable, Collection, Border, Style, Color, Import
 * Object, Import File, Key, and System definitions - and every definition
 * "starts with an open square bracket and ends with a closed bracket".
 *
 * Tally rejected the bundle with T0027 "The attribute definition started
 * without a valid definition", pointing at the first `Constant:` line.
 *
 * This script rewrites
 *     Constant: JpFine24 : "0.999"
 * into
 *     Function: JpFine24
 *         Type: String
 *         Returns: String : Any
 *         JpFine24 = "0.999"
 *
 * and adds `()` at every use site, skipping string literals and comments so
 * that display text and documentation are left untouched.
 *
 * Idempotent-ish: re-running finds no `Constant:` lines and exits 0.
 *
 * usage: node constant-to-function.mjs ../tdl
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? join(process.cwd(), "tdl");

// 1. Collect every constant name so use sites can be rewritten too.
const files = readdirSync(dir).filter((f) => f.endsWith(".tdl")).sort();
const names = new Set();
const CONST_RE = /^Constant:[ \t]*([A-Za-z_]\w*)[ \t]*:[ \t]*(".*"|[^ \t].*?)[ \t]*$/;

for (const f of files) {
  for (const line of readFileSync(join(dir, f), "utf8").split(/\r?\n/)) {
    const m = CONST_RE.exec(line.trim());
    if (m) names.add(m[1]);
  }
}
if (!names.size) {
  console.log("no Constant: definitions found - nothing to do.");
  process.exit(0);
}
const alt = [...names].sort((a, b) => b.length - a.length).join("|");
const USE_RE = new RegExp(`\\b(${alt})\\b(?!\\s*\\()`, "g");

// Replace NAME with NAME() outside quoted strings and comment-only lines.
function addParens(code) {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"') {
      // copy the string literal verbatim
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === '"') { j++; break; }
        j++;
      }
      out += code.slice(i, j);
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(USE_RE, "$1()");
}

let converted = 0, callSites = 0;
for (const f of files) {
  const path = join(dir, f);
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    const m = CONST_RE.exec(t);
    if (m) {
      const [, name, rawValue] = m;
      const value = rawValue.trim();
      // Keep the original indentation style of the file (all constants are col 0).
      out.push(
        `Function: ${name}`,
        `    Type: String`,
        `    Returns: String : Any`,
        `    ${name} = ${value}`
      );
      converted++;
      continue;
    }
    if (t.startsWith(";")) { out.push(line); continue; }   // comment: leave alone
    const rewritten = addParens(line);
    if (rewritten !== line) {
      callSites += (line.match(USE_RE) ? line.match(USE_RE).length : 0);
      out.push(rewritten);
    } else out.push(line);
  }
  writeFileSync(path, out.join("\n"), "utf8");
}

console.log(`converted ${converted} Constant: definitions into Function: definitions`);
console.log(`rewrote    ${callSites} use sites to use ()`);