#!/usr/bin/env node
// fix-style-attrs.mjs
//
// WHY
//   With [Line:] clean, Tally advanced to the next class and reported
//
//       error T0014: Incorrect attribute 'Colour' is used for the definition
//       'Style'.   "D:\Jewel Pro\JadePro.tdl"(1586)
//
//   This is the last error class the project's own probe p25 predicted.
//   Style accepts exactly four attributes - Font, Height, Bold, Italic - and
//   Tally has now confirmed it directly rather than by inference. Everything
//   else found on a [Style:] block here is illegal:
//
//       Colour (8)  Background Colour (7)  Border (8)  Border Colour (7)
//       Border Style (7)  Align (14)  Font Color (1)          = 52 total
//
//   p25 records where each one really belongs, on the Field:
//
//       Colour           -> Field : Color
//       Background Colour-> Field : Background
//       Border           -> Field : Border : <name>  + a [Border:] definition
//       Align            -> Field : Align
//
// WHAT
//   Delete them from [Style:] and leave Font/Height/Bold/Italic.
//
// WHY DELETE AND NOT MIGRATE
//   A Style is shared. 947 Field definitions reference these 22 Styles
//   (JpGridHead alone is 238). Moving an attribute off a Style onto a Field
//   therefore means stamping it onto every referencing Field - roughly 3,000
//   added attribute lines across ~950 definitions in a 17,000-line file.
//
//   That is a large, risky change to make while the file still does not load
//   and so cannot be tested. Dropping unblocks loading now, with a small and
//   reversible diff. The cost is cosmetic: affected screens fall back to Tally's
//   default colours and lose their borders.
//
//   Dropping is safe rather than destructive here. These attributes only ever
//   appeared in pairs - a foreground colour with a background, a border with a
//   border colour - so nothing is left as white-on-white. Every affected Field
//   simply renders in Tally's defaults.
//
//   Each deletion leaves a comment naming the Field attribute it would map to,
//   so the styling can be restored deliberately later.
//
// IDEMPOTENT
//   A second run finds no illegal attribute on a Style and no-ops.
//
// USAGE
//   node fix-style-attrs.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');

// Illegal on Style -> the Field attribute p25 says it belongs on.
const STRIP = new Map([
  ['colour', 'Color'],
  ['font color', 'Color'],
  ['background colour', 'Background'],
  ['border', 'Border : <name> + [Border:] definition'],
  ['border colour', 'Border Colour (no Field equivalent)'],
  ['border style', 'Border Style (no Field equivalent)'],
  ['align', 'Align'],
]);

const removed = new Map();
const styles = new Set();
let files = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const src = fs.readFileSync(p, 'utf8').split(/\r?\n/);

  let type = null, baseIndent = null, styleName = null, hit = false;
  const out = [];

  for (const L of src) {
    const h = /^\s*\[([A-Za-z][\w ]*?):\s*([^\]]*)\]/.exec(L);
    if (h) {
      type = h[1].trim();
      baseIndent = null;
      styleName = type.toLowerCase() === 'style' ? h[2].trim() : null;
      out.push(L);
      continue;
    }

    if (/^\S/.test(L) && L.trim() && !L.trim().startsWith(';')) {
      type = null; baseIndent = null; styleName = null;
      out.push(L);
      continue;
    }

    const a = /^(\s*)([A-Za-z][A-Za-z0-9 -]*?)\s*:/.exec(L);
    if (!a) { out.push(L); continue; }

    const indent = a[1].length;
    if (baseIndent === null) baseIndent = indent;
    const key = a[2].trim().toLowerCase();

    // Only the Style's OWN attributes, at its own indent level.
    if (type && type.toLowerCase() === 'style' && indent === baseIndent && STRIP.has(key)) {
      const dest = STRIP.get(key);
      removed.set(key, (removed.get(key) || 0) + 1);
      styles.add(styleName);
      hit = true;
      out.push(`${' '.repeat(indent)}; removed by fix-style-attrs.mjs - Style takes only ` +
               `Font/Height/Bold/Italic; on a Field this would be: ${dest}`);
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

const total = [...removed.values()].reduce((a, b) => a + b, 0);
console.log(`\ntotal: ${total} attribute(s) removed from ${styles.size} [Style:] definition(s) across ${files} file(s)`);
for (const [k, n] of [...removed].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${k}`);
