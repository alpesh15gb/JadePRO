#!/usr/bin/env node
// fix-line-part-name.mjs
//
// WHY
//   The companion to fix-line-container-attrs.mjs. That pass cleared
//   Title/Paper/Margin-* off [Line:]; this one clears the last two illegal
//   attributes that were blocking Tally's T0014 on the same definition type:
//
//     Part Name : <part>   22 sites
//     New-page  : Yes       1 site
//
//   Tally compiles a TDL file all-or-nothing, so leaving these in place means
//   the bundle never loads, no matter how many other errors are fixed.
//
// WHAT
//   1. `Part Name : X` on a [Line:]  ->  `Explode : X : Yes`
//
//      Line has no `Part Name` attribute. Nesting a Part inside a Line is done
//      with `Explode : <PartName> : Yes`, which the Line page lists among its
//      RepeatedTotal group attributes alongside Field, Key, Local, Use, Indent,
//      Repeat, Page Break, Next Page, On, Stripe. Probe p33
//      (00_Build/probes/p33_line_explode.tdl) exists for exactly this case and
//      shows the inner Part defined at top level, not nested.
//
//      The target Part is NOT moved. It stays a top-level [Part:] definition and
//      is referenced from the Line, so every existing reference to it keeps
//      resolving. Nothing is deleted, so no layout loses content - which is what
//      made the earlier plan to just strip these attributes unsafe.
//
//      Targets seen: JpReportHeader (16), Width (4), JpItemValidateMsg (1),
//      JpInvoiceItemHead (1). `Width` is Tally's own built-in Width-report Part
//      and is deliberately NOT defined in this project; Explode references it the
//      same way `Part Name` did.
//
//   2. `New-page : Yes` on a [Line:]  ->  `Page Break : Yes`
//
//      One site, on JpTallyTagBulkPrintLine1 - the first line of the bulk tag
//      layout. `New-page` is not a Line attribute; `Page Break` and `Next Page`
//      are the two that exist. `New-page: Yes` on the FIRST line expresses
//      "start this on a fresh page", which is Page Break's job; `Next Page`
//      advances past the current page and is the wrong sense here.
//
//      CAVEAT, recorded rather than silently fixed: this Form has no `Repeat:`,
//      so it prints once and the per-tag pagination it was reaching for does not
//      actually happen today. Page Break preserves the author's intent and the
//      attribute is legal; adding `Repeat` to the Form is a behaviour change and
//      is left as a decision for the user.
//
// IDEMPOTENT
//   A second run finds no Part Name/New-page on a Line and no-ops.
//
// USAGE
//   node fix-line-part-name.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');

const byTarget = new Map();
const newPage = [];
let files = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const src = fs.readFileSync(p, 'utf8').split(/\r?\n/);

  let type = null, baseIndent = null, hit = false;
  const out = [];

  for (const L of src) {
    const h = /^\s*\[([A-Za-z][\w ]*?):/.exec(L);
    if (h) { type = h[1].trim(); baseIndent = null; out.push(L); continue; }

    if (/^\S/.test(L) && L.trim() && !L.trim().startsWith(';')) {
      type = null; baseIndent = null; out.push(L); continue;
    }

    const a = /^(\s*)([A-Za-z][A-Za-z0-9 -]*?)\s*:\s*(.*)$/.exec(L);
    if (!a) { out.push(L); continue; }

    const indent = a[1].length;
    if (baseIndent === null) baseIndent = indent;
    const key = a[2].trim().toLowerCase();
    const value = a[3].trim();

    // Only the Line's OWN attributes, at its own indent level.
    if (type && type.toLowerCase() === 'line' && indent === baseIndent) {
      if (key === 'part name') {
        const target = value.replace(/^["']|["']$/g, '').trim();
        byTarget.set(target, (byTarget.get(target) || 0) + 1);
        out.push(`${' '.repeat(indent)}; Part Name routed to Explode by fix-line-part-name.mjs`);
        out.push(`${' '.repeat(indent)}Explode : ${target} : Yes`);
        hit = true;
        continue;
      }
      if (key === 'new-page') {
        newPage.push(f);
        out.push(`${' '.repeat(indent)}; New-page routed to Page Break by fix-line-part-name.mjs`);
        out.push(`${' '.repeat(indent)}; NOTE this Form has no Repeat:, so it still prints once.`);
        out.push(`${' '.repeat(indent)}Page Break : ${value || 'Yes'}`);
        hit = true;
        continue;
      }
    }

    out.push(L);
  }

  if (hit) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: rewritten`);
    files++;
  }
}

const total = [...byTarget.values()].reduce((a, b) => a + b, 0);
console.log(`\nPart Name -> Explode : ${total} site(s)`);
for (const [t, n] of [...byTarget].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${t}`);
console.log(`New-page  -> Page Break : ${newPage.length} site(s) in ${[...new Set(newPage)].join(', ') || 'none'}`);
console.log(`files: ${files}`);
