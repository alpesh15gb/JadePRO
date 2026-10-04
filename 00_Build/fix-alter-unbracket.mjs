#!/usr/bin/env node
// fix-alter-unbracket.mjs
//
// WHY
//   The earlier bracket-definitions.mjs pass wrapped every column-0 definition in
//   square brackets, including the 8 `Alter:` blocks. Tally rejects that with:
//
//       JadePro.tdl(1254): error T0006: The definition type is misspelt or incorrect.
//
//   T0006 is raised against the bracketed word `Alter`, which tells us Tally parsed
//   `[Alter` as a *definition* and did not recognise `Alter` as a definition type.
//   That matches the official TDL definition-type list (Menu, Report, Form, Part,
//   Line, Field, Button, Table, Object, Variable, Collection, Border, Style, Color,
//   Import Object, Import File, Key, System) which does not contain `Alter`.
//
//   The original sources had `Alter: Company` UNBRACKETED and with no `End:`,
//   which is the correct TDL statement form. The bracketing pass broke it.
//
// WHAT
//   Rewrite `^[Alter: <args>]` -> `Alter: <args>`, and `[Alter: X]` -> `Alter: X, ...`
//   is preserved verbatim otherwise. Idempotent: a second run finds nothing to do.
//
//   NOTE: the two-argument forms (`Alter: Item, JpItemJewelPart`,
//   `Alter: Sales Voucher, Item Details`) are left exactly as-is apart from the
//   brackets. Whether two-argument Alter needs brackets is settled empirically by
//   00_Build/probes/p03_alter_unbracketed_2arg.tdl vs p04_alter_bracketed_2arg.tdl.

import fs from 'node:fs';
import path from 'node:path';

const TDL_DIR = path.resolve('tdl');
const files = fs.readdirSync(TDL_DIR).filter((f) => f.endsWith('.tdl')).sort();

let totalChanged = 0;
for (const f of files) {
  const p = path.join(TDL_DIR, f);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)\[Alter:(.*)\]\s*$/.exec(lines[i]);
    if (!m) continue;
    lines[i] = `${m[1]}Alter:${m[2]}`;
    changed++;
  }
  if (changed) {
    fs.writeFileSync(p, lines.join('\n'));
    console.log(`${f}: unbracketed ${changed} Alter block(s)`);
    totalChanged += changed;
  }
}

console.log(totalChanged === 0 ? 'no [Alter: ...] blocks found (already migrated?)' : `total: ${totalChanged}`);