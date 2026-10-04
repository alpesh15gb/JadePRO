#!/usr/bin/env node
// restore-print-conditions.mjs
//
// WHY
//   fix-print-to-form.mjs dropped `If: <cond>` as control flow with no home in
//   a layout. That was right for most attributes but WRONG here: in the invoice
//   layout the condition is what stops the old-gold block being printed on an
//   invoice that has no old gold in it. Dropping it silently would ship an
//   empty section on every invoice.
//
//   TDL's documented way to suppress a line conditionally is the Line's `Empty`
//   attribute (LineFormat group):
//
//       Empty : <Logical Expression>
//
//   so the guard belongs on each Line of the guarded Part, not on the Part,
//   which has no `Empty`.
//
//   The layout read:
//
//       If: ##JwlOldGoldRef <> ""
//       Part Name: JpInvoiceOldGold
//
//   which means "include this part only when there is an old-gold reference".
//   That is exactly `Empty : ##JwlOldGoldRef = ""` - the negation.
//
// IDEMPOTENT
//   Skips any Line that already carries an `Empty :`.

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');

/** Part name -> logical expression that must be FALSE for its lines to print. */
const GUARDS = [
  { part: 'JpInvoiceOldGold', empty: '##JwlOldGoldRef = ""',
    why: 'layout guard was: If: ##JwlOldGoldRef <> ""' },
];

let added = 0, parts = 0, files = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

  // Which lines belong to a guarded part?
  const guarded = new Set();
  for (let i = 0; i < lines.length; i++) {
    const h = /^\[Part:\s*([^\]]+)\]\s*$/.exec(lines[i]);
    if (!h) continue;
    const g = GUARDS.find((x) => x.part === h[1].trim());
    if (!g) continue;
    parts++;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\S/.test(lines[j]) && lines[j].trim() && !lines[j].trim().startsWith(';')) break;
      body.push(lines[j]);
    }
    for (const L of body) {
      const m = /^\s+(?:Line|Lines)\s*:\s*(.*)$/.exec(L);
      if (m) m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => guarded.add(n));
    }
  }
  if (!guarded.size) continue;

  // Give each guarded Line an `Empty`, unless it already has one.
  const out = [];
  let current = null;
  let hit = 0;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const h = /^\[Line:\s*([^\]]+)\]\s*$/.exec(L);
    if (h) { current = h[1].trim(); out.push(L); continue; }
    if (/^\[/.test(L)) { current = null; out.push(L); continue; }

    const g = current && guarded.has(current) ? GUARDS.find((x) => guarded.has(current)) : null;
    if (g && /^\s+Empty\s*:/.test(L)) { current = null; out.push(L); continue; }

    out.push(L);
    if (g) {
      // Append at the end of this Line's body.
      const nextIsDef = i + 1 >= lines.length ||
        (/^\[/.test(lines[i + 1]) && lines[i + 1].trim());
      if (nextIsDef) {
        out.push(`    ; ${g.why}`);
        out.push(`    Empty : ${g.empty}`);
        added++; hit++;
        current = null;
      }
    }
  }

  if (hit) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: ${hit} guarded Line(s) given an Empty condition`);
    files++;
  }
}

console.log(`total: ${added} Empty condition(s) across ${parts} guarded Part(s) in ${files} file(s)`);