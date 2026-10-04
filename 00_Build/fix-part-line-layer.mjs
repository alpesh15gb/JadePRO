#!/usr/bin/env node
// fix-part-line-layer.mjs
//
// WHY
//   Tally reported, against JadePro.tdl line 1271:
//
//       error T0014: Incorrect attribute 'Field' is used for the definition 'Part'.
//
//   The official TallyPrime Developer Reference states the interface hierarchy is
//   Report -> Form -> Part -> Line -> Field, and that "a Part acts as a container
//   for one or more Parts or Lines". A Part's own attributes are Line (alias Lines),
//   Repeat, Scroll, Border, Height, Width, Float, Background, Button, Bottom
//   Line/Part, Space Top, Stripe, Use/Add/Set/Local, ... It has NO `Field`, NO
//   `Text`, NO `Style`, NO `Font`, NO `Align`. Those belong to a Line.
//
//   All 17 [Part:] blocks were written as though Fields were direct children, so
//   every one is wrong the same way. `Lines: 1, 1, 1, ...` was also meaningless:
//   Lines is an alias of Line, so that declares lines *named* "1", not a count.
//
// WHAT
//   For each [Part: X] block, split the body into
//     - a Part body: only attributes genuinely valid on Part, plus `Line: <names>`
//     - one [Line:] definition per Field:/Text: starter, carrying that item and
//       any trailing sub-attributes (Style/Font/Align/Width/Indent/...) that follow
//       it until the next Part-valid attribute.
//
//   Line names derive from the Part name, so they are unique: <Part>Line<n>.
//   Original field names and comments are preserved verbatim.
//
// SCOPE
//   [Part:] and [Print:] blocks - both had Fields and Text sitting directly in a
//   container that cannot hold them. [Print:] is itself not one of Tally's 20
//   definition types, so those blocks still need to become [Report:] definitions
//   with a print layout; that is a separate, larger pass.
//
//   [Screen:] blocks have the same containment defect plus a bigger one: `Screen`
//   is not a definition type either, so those 15 blocks additionally need
//   Report/Form wrapping. Also a separate pass.
//
// IDEMPOTENT
//   A second run finds no top-level Field:/Text: left inside a Part and no-ops.
//
// USAGE
//   node fix-part-line-layer.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');

// Attributes the Part definition genuinely accepts (TallyHelp "Part" page).
// Anything else at Part top level belongs inside a Line.
const PART_OK = new Set([
  'Line', 'Repeat', 'Border', 'Common Border', 'Bottom Line', 'Bottom Part',
  'Break', 'Break On', 'Button', 'Vertical', 'Float', 'Height', 'Width', 'Scroll',
  'Space Top', 'Stripe', 'Background', 'Image', 'Object', 'ObjectEx', 'Total',
  'Combine', 'Page Break', 'Set', 'Local', 'Use', 'Add', 'Replace', 'Delete',
  'On', 'Access Name', 'Excel Sheet Name', 'Excel Auto Fit', 'JSON Tag',
  'Graph Type', 'Enable Graph Cursor', 'Graph Display Num Rows', 'DMPMode', 'Fixed',
  'Display X Axis Legend',
]);

const IND = '    ';
const isStart = (line) => new RegExp('^' + IND + '(Field|Text)\\s*:').test(line);

// `Lines` is an alias of `Line`, so `Lines: 1, 1, 1` declares lines *named* "1" -
// it is never a line count. Such a line carries no meaning and is dropped.
// `Lines: Foo, Bar` (real line names) is kept and merged into `Line:`.
const isCountLines = (line) =>
  /^(\s*)Lines\s*:\s*[\d\s,]*\d\s*$/.test(line);

function topAttr(raw) {
  const m = /^(\s*)([A-Za-z][A-Za-z0-9 ]*)\s*:/.exec(raw);
  return m ? { indent: m[1].length, name: m[2] } : null;
}

let totalParts = 0, totalLines = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const out = [];
  let i = 0;
  let fileParts = 0;

  while (i < lines.length) {
    const head = /^\[(Part|Print):\s*([^\]]+)\]\s*$/.exec(lines[i]);
    if (!head) { out.push(lines[i]); i++; continue; }

    const partName = head[2].trim();
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const L = lines[j];
      if (/^\S/.test(L) && L.trim() && !L.trim().startsWith(';')) break;
      body.push(L);
    }

    if (!body.some(isStart)) {
      out.push(lines[i]);
      for (const b of body) out.push(b);
      i = j;
      continue;
    }

    const partAttrs = [];
    const groups = [];
    let cur = null;

    for (const b of body) {
      const t = b.trim();
      if (!t) { (cur ?? partAttrs).push(b); continue; }
      if (t.startsWith(';')) { (cur ?? partAttrs).push(b); continue; }
      const at = topAttr(b);
      if (!at) { (cur ?? partAttrs).push(b); continue; }

      if (isStart(b)) { cur = [b]; groups.push(cur); continue; }
      if (at.name === 'Lines' && at.indent === IND.length) {
        if (isCountLines(b)) continue;          // meaningless count -> drop
        partAttrs.push(b.replace(/^(\s*)Lines(\s*):/, '$1Line$2:')); // real names -> Line
        cur = null;
        continue;
      }
      if (at.indent === IND.length && PART_OK.has(at.name)) { partAttrs.push(b); cur = null; continue; }
      if (cur) cur.push(b);
      else { cur = [b]; groups.push(cur); }
    }

    const lineNames = groups.map((_, k) => `${partName.replace(/[^A-Za-z0-9]/g, '')}Line${k + 1}`);

    // Part head, then its retained attributes, then the Line reference list.
    // `Line` is a single-list attribute: repeating it overwrites, so merge the
    // generated names into any existing `Line:` rather than adding a second one.
    const existing = partAttrs.filter((a) => new RegExp('^' + IND + 'Line\\s*:').test(a));
    const kept = partAttrs.filter((a) => !new RegExp('^' + IND + 'Line\\s*:').test(a));
    const prior = existing
      .flatMap((a) => a.slice(a.indexOf(':') + 1).split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = [...new Set([...prior, ...lineNames])];

    out.push(lines[i]);
    for (const a of kept) out.push(a);
    out.push(`${IND}Line: ${merged.join(', ')}`);
    out.push('');

    // Then the generated Line definitions, each preserving its original items.
    groups.forEach((g, k) => {
      out.push(`[Line: ${lineNames[k]}]`);
      for (const g2 of g) out.push(g2);
    });

    fileParts++;
    totalParts++;
    totalLines += groups.length;
    i = j;
  }

  if (fileParts) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: ${fileParts} Part block(s) restructured`);
  }
}

console.log(`total: ${totalParts} Part block(s), ${totalLines} generated Line definition(s)`);