#!/usr/bin/env node
// fix-keys-definitions.mjs
//
// WHY
//   Tally rejected JadePro.tdl:1426 with
//
//       error T0006: The definition type is misspelt or incorrect.
//       [Keys: JpSalesKey]
//
//   There is no `Keys` definition type. TallyHelp's Definition list has 28
//   types and `Key` is not one of them (there is `Key Value Map`, which is a
//   different thing). The old TDL-9 list sometimes showed `Key` alongside
//   `Button`; TallyPrime's does not, and the compiler has now ruled on it.
//
//   The shortcuts themselves are not a TDL concern either. TallyHelp's Menu
//   page says, of the `Item` attribute:
//
//       "There is no separate provision to define a hotkey for an Item, the
//        system automatically assigns the next available hotkey from the menu."
//
//   and offers `Key Item : <Name>:<Hot Key>:<Action>:<Parameter>` for the case
//   where a developer does want to pin one. So hotkeys belong on a menu item,
//   not in a separate definition.
//
// WHAT
//   Deletes the three [Keys:] blocks. Nothing referenced them: the menu routes
//   to JpSalesScreen and JpRateScreen through
//
//       Item: ... : Display: JpSalesScreen
//
//   so no navigation is lost. If pinned shortcuts are wanted later they are
//   added as `Key Item` on the menu item, not as a standalone definition.
//
// IDEMPOTENT
//   A second run finds no [Keys:] block and no-ops.
//
// USAGE
//   node fix-keys-definitions.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');
const head = /^\[Keys\s*:/i;
let removed = 0, files = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const out = [];
  let i = 0, hit = 0;

  while (i < lines.length) {
    if (!head.test(lines[i])) { out.push(lines[i]); i++; continue; }

    // Drop the whole block: the header plus every line up to the next
    // column-0 definition or statement.
    let j = i + 1;
    for (; j < lines.length; j++) {
      const L = lines[j];
      if (/^\S/.test(L) && L.trim() && !L.trim().startsWith(';')) break;
    }
    // Swallow one trailing blank line so we do not leave a double gap.
    while (out.length && !out[out.length - 1].trim()) out.pop();
    out.push('');
    if (!hit) {
      out.push('; [Keys: ...] removed by fix-keys-definitions.mjs - "Keys" is not a TallyPrime');
      out.push('; definition type. Menu hotkeys belong on the menu item as `Key Item`.');
    }
    out.push('');
    hit++; i = j;
  }

  if (hit) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: ${hit} [Keys:] definition(s) removed`);
    removed += hit; files++;
  }
}

console.log(`total: ${removed} [Keys:] definition(s) removed from ${files} file(s)`);