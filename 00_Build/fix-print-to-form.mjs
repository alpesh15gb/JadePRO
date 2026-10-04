#!/usr/bin/env node
// fix-print-to-form.mjs
//
// WHY
//   Tally rejected JadePro.tdl:1426 with
//
//       error T0006: The definition type is misspelt or incorrect.
//       [Keys: JpSalesKey]
//
//   and the next 35 offenders are `[Print:]`, which is not one of TallyPrime's
//   28 definition types either. TallyHelp's Report page lists `Print` as a
//   Report *attribute*, and a print layout is a Form: "A Report ... references
//   one or more Forms". So:
//
//       [Print: X]              ->   [Form: X]
//                                    [Part: XLines]
//
//   The new Form deliberately keeps the ORIGINAL name `X`, so every existing
//   `Print : X` reference on the owning Report keeps resolving and no caller
//   has to be touched.
//
//   The blocks came in two shapes:
//     flat     - `Width: <col widths...>` repeated, then `Line: <names>`
//     nested   - `Part Name: <existing Part>` repeated, optionally `If:`/`End`
//
// WHAT IS DROPPED, AND WHY (agreed with the user)
//   Width: 587 of them. A Width is a Field attribute; these were positional
//     column widths written on the container, so they had nowhere to go. Every
//     Field falls back to a default width and printed reports are plainer.
//   Paper: / Margin-left / -right / -top / -bottom, 34 layouts. Documented
//     nowhere in the TallyPrime reference; print sizing falls back to Tally
//     defaults.
//   If: / End - procedural control flow has no meaning in a layout.
//   Title: <width, "text"> inside the layout - the title belongs on the Report,
//     which already carries one. Unwrapped where the Report lacks it.
//   Each drop leaves a comment recording it, so the intent is recoverable.
//
// IDEMPOTENT
//   A second run finds no [Print:] block and no-ops.
//
// USAGE
//   node fix-print-to-form.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');
const IND = '    ';
const head = /^\[Print:\s*([^\]]+)\]\s*$/;

const dropped = { Width: 0, Paper: 0, Margin: 0, If: 0, Title: 0, Other: 0 };
let forms = 0, parts = 0, orphanReports = 0, files = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const src = fs.readFileSync(p, 'utf8').split(/\r?\n/);

  // Pass 1: collect the [Print: X] names this file defines, and which ones are
  // already referenced by `Print : X` on some Report.
  const defined = new Set();
  const referenced = new Set();
  for (const L of src) {
    const h = head.exec(L);
    if (h) defined.add(h[1].trim());
    const m = /^\s*Print\s*:\s*([A-Za-z][\w]*)\s*$/.exec(L);
    if (m) referenced.add(m[1]);
  }

  const out = [];
  let i = 0, hit = 0;

  while (i < src.length) {
    const h = head.exec(src[i]);
    if (!h) { out.push(src[i]); i++; continue; }

    const name = h[1].trim();
    const body = [];
    let j = i + 1;
    for (; j < src.length; j++) {
      const L = src[j];
      if (/^\S/.test(L) && L.trim() && !L.trim().startsWith(';')) break;
      body.push(L);
    }

    const lineNames = [];
    const partNames = [];
    let height = null, title = null;
    const notes = new Set();

    for (const raw of body) {
      const t = raw.trim();
      if (!t || t.startsWith(';')) continue;
      const m = /^([A-Za-z][A-Za-z0-9 _-]*?)\s*:\s*(.*)$/.exec(t);
      if (!m) continue;
      const [, key, value] = m;
      const k = key.toLowerCase();

      if (k === 'line' || k === 'lines') {
        lineNames.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
      } else if (k === 'part name') {
        partNames.push(value.trim());
      } else if (k === 'height') {
        height = value.trim();
      } else if (k === 'title') {
        // `Title: <1000, "text">` -> the literal text.
        const tm = /<\s*\d+\s*,\s*(".*")\s*>/.exec(value) || /(".*")/.exec(value);
        title = tm ? tm[1] : value.trim();
        dropped.Title++;
      } else if (k === 'width') {
        dropped.Width++; notes.add('Width (column widths)');
      } else if (k === 'paper') {
        dropped.Paper++; notes.add('Paper');
      } else if (k.startsWith('margin')) {
        dropped.Margin++; notes.add(key);
      } else if (k === 'if' || k === 'end' || k === 'else') {
        dropped.If++; notes.add(`${key} (control flow)`);
      } else {
        dropped.Other++; notes.add(`${key}`);
      }
    }

    out.push('');
    out.push(`; [Print: ${name}] -> [Form: ${name}] by fix-print-to-form.mjs.`);
    out.push(`; "Print" is a Report attribute, not a definition type; a print layout is a Form.`);
    if (notes.size) {
      out.push(`; dropped (no home in TallyPrime, per user decision): ${[...notes].join(', ')}`);
    }

    // A layout nobody prints: give it a Report so the Form has an owner.
    if (!referenced.has(name)) {
      out.push('');
      out.push(`[Report: ${name}PrintReport]`);
      out.push(`${IND}Form : ${name}`);
      out.push(`${IND}Print : ${name}`);
      if (title) out.push(`${IND}Title : ${title}`);
      orphanReports++;
    }

    out.push('');
    out.push(`[Form: ${name}]`);
    if (height) out.push(`${IND}Height : ${height}`);
    if (partNames.length) {
      out.push(`${IND}Parts : ${partNames.join(', ')}`);
    }

    if (lineNames.length) {
      const partName = `${name}Lines`;
      out.push(`${IND}Parts : ${partName}`);
      out.push('');
      out.push(`[Part: ${partName}]`);
      out.push(`${IND}Lines : ${lineNames.join(', ')}`);
      parts++;
    }
    out.push('');

    hit++; forms++; i = j;
  }

  if (hit) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: ${hit} [Print:] definition(s) rewritten`);
    files++;
  }
}

console.log(`total: ${forms} [Form:] (${parts} generated [Part:]), ` +
            `${orphanReports} generated owner [Report:] in ${files} file(s)`);
console.log(`dropped: ${JSON.stringify(dropped)}`);