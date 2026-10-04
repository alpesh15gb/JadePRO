#!/usr/bin/env node
// fix-line-container-attrs.mjs
//
// WHY
//   Tally rejected JadePro.tdl with
//
//       error T0014: Incorrect attribute 'Title' is used for the definition 'Line'.
//       "D:\Jewel Pro\JadePro.tdl"(1449)
//
//   Line accepts 48 attributes (border, combine, explode, field, key, local,
//   use, indent, repeat, page break, next page, on, stripe, dmpmode, fixed,
//   height, line, remove, right field, select, space bottom, space top, empty,
//   skip rows, full object, option, switch, the json/xml tag family,
//   pre printed (+ border), access name, add, replace, delete, invisible,
//   local formula, no cursor, set, fields, left field, left fields,
//   right fields, totals, total, empty if, empty on).
//
//   Title, Paper and Margin-* appear in none of them. They are print-LAYOUT
//   attributes that belonged to the [Print:] container, and they ended up on a
//   Line because fix-part-line-layer.mjs ran BEFORE fix-print-to-form.mjs: it
//   had already split each Print body into [Line:] definitions, sweeping the
//   container's leading attributes onto the first Line it generated. The later
//   Print->Form pass cleaned the container but could not reach attributes that
//   had already migrated onto a child.
//
//   This is one defect with 142 instances across 12 modules, not 142 defects.
//
// WHAT
//   Delete Title / Paper / Margin-left / -right / -top / -bottom from [Line:]
//   bodies. Nothing is moved or rewritten.
//
// WHY DELETING LOSES NOTHING
//   Title: every affected layout's owning [Report:] or [Collection: Report:]
//   already carries the identical title - verified line by line before this
//   pass. The Line copy was always a duplicate.
//   Paper / Margin-*: already dropped from the [Form:] containers by
//   fix-print-to-form.mjs under the standing decision that they have no home
//   in the TallyPrime reference. Deleting the Line copies makes that decision
//   consistent instead of leaving a half-applied removal behind.
//
//   Each deletion leaves a comment recording it, so the intent is recoverable.
//
// SCOPE - DELIBERATELY NARROW
//   Two other illegal attributes also sit on [Line:] and are NOT touched here:
//     Part Name (22)  - references a real Part. Deleting it would silently drop
//                       the report header from ~10 print layouts. Needs a
//                       structural decision, not a textual one.
//     New-page (1)    - appears once; needs a probe before choosing a route.
//   Tally reports one error at a time, so expect a further T0014 after this
//   pass if either is still present. That is the intended next step, not a
//   regression from this one.
//
// IDEMPOTENT
//   A second run finds no Title/Paper/Margin-* on a Line and no-ops.
//
// USAGE
//   node fix-line-container-attrs.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');

// Attributes to remove, and how each is accounted for.
const STRIP = new Map([
  ['title', 'title'],
  ['paper', 'paper'],
  ['margin-left', 'margin'],
  ['margin-right', 'margin'],
  ['margin-top', 'margin'],
  ['margin-bottom', 'margin'],
]);

const removed = { title: 0, paper: 0, margin: 0 };
const touchedLines = new Set();
let files = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const src = fs.readFileSync(p, 'utf8').split(/\r?\n/);

  // Walk the file tracking the current definition and the indent its own
  // attributes sit at, so nested sub-attributes are never mistaken for the
  // definition's own.
  let type = null, baseIndent = null, lineName = null;
  const out = [];
  let hit = false;

  for (let i = 0; i < src.length; i++) {
    const L = src[i];

    const h = /^\s*\[([A-Za-z][\w ]*?):/.exec(L);
    if (h) {
      type = h[1].trim();
      baseIndent = null;
      lineName = type.toLowerCase() === 'line'
        ? (/^\s*\[Line:\s*([^\]]+)\]/.exec(L) || [])[1]
        : null;
      out.push(L);
      continue;
    }

    // A non-indented, non-comment, non-blank line closes the definition.
    if (/^\S/.test(L) && L.trim() && !L.trim().startsWith(';')) {
      type = null; baseIndent = null; lineName = null;
      out.push(L);
      continue;
    }

    const a = /^(\s*)([A-Za-z][A-Za-z0-9 -]*?)\s*:/.exec(L);
    if (!a) { out.push(L); continue; }

    const indent = a[1].length;
    if (baseIndent === null) baseIndent = indent;
    const key = a[2].trim().toLowerCase();

    // Only the Line's OWN attributes, at its own indent level.
    const isOwnAttr = type && type.toLowerCase() === 'line' && indent === baseIndent;

    if (isOwnAttr && STRIP.has(key)) {
      removed[STRIP.get(key)]++;
      touchedLines.add(lineName);
      hit = true;
      out.push(`${' '.repeat(indent)}; removed by fix-line-container-attrs.mjs - ` +
               `${a[2].trim()} is a print-layout attribute, not a Line attribute`);
      continue;
    }

    out.push(L);
  }

  if (hit) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: cleaned`);
    files++;
  }
}

console.log(`\ntotal: ${touchedLines.size} [Line:] definition(s) cleaned across ${files} file(s)`);
console.log(`removed: Title ${removed.title}, Paper ${removed.paper}, Margin-* ${removed.margin}`);
console.log(`left alone on Line: Part Name (22), New-page (1) - see header`);
