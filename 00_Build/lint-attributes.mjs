#!/usr/bin/env node
// lint-attributes.mjs
//
// THE ORACLE. Walks every definition in the bundle and checks each attribute
// against the table in tdl-attributes.mjs. This replaces the
// one-error-per-F11-screenshot loop with one local pass over every line.
//
// OWNERSHIP RULE (learned from T0014 at JadePro.tdl:1274)
//
//   Indentation opens a sub-level, EXCEPT after an inline `<...>` definition.
//   Tally said, of this:
//
//       Field: <Field-Id: JwlShopName, Label: "Shop / Showroom Name">
//           Width: 400
//
//   error T0014: Incorrect attribute 'Width' is used for the definition 'Line'.
//
//   The continuation line is indented, yet Tally attributes it to the Line, not
//   to the inline Field. So an inline `<...>` definition is single-line: it does
//   not open an indentation sub-level. By contrast `Add: Field` followed by a
//   deeper `Field-id:` does open one.
//
//   That single rule is why fix-part-line-layer.mjs moved 1,826 attributes to
//   the Line layer while satisfying the bracket checker. It is the whole
//   mechanism behind TDL-SPEC.md section 10.
//
// EXIT
//   0 = no attribute is on a definition that rejects it
//   1 = at least one misrouted attribute
//   2 = a definition type in the bundle has no row in the table (harness gap)

import fs from 'node:fs';
import { ATTRS, routeFor } from './tdl-attributes.mjs';

const FILE = process.argv[2] || 'JadePro.tdl';
const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/);

// Definition types TallyPrime actually has (TDL-SPEC.md section 1). Anything
// else is T0006 territory, reported separately.
const REAL_TYPES = new Set([
  'Border', 'Button', 'Collection', 'Color', 'COM Interface', 'Field', 'Form',
  'Function', 'Import File', 'Import Object', 'Key Value Map', 'Line', 'Menu',
  'Name Set', 'Notification', 'Object', 'Object Map', 'Part', 'Progress Bar',
  'Query Box', 'Report', 'Resource', 'Rule Set', 'Style', 'System', 'Variable',
  'Watermark', 'PDF',
]);
const KNOWN_SUBS = new Set(['Data', 'Report', 'Source']);

// [Type: name] / [#Type: name] / [*Type: name] / [!Type: name]
const defRe = /^\[([#*!]*)([A-Za-z][A-Za-z ]*?)\s*(?::\s*([^\]]*?))?\]\s*$/;
const stmtRe = /^([A-Za-z][A-Za-z ]*?)\s*:(.*)$/;

const attrName = (s) => /^([A-Za-z][A-Za-z0-9 ]*?)\s*:/.exec(s.trim())?.[1] ?? null;
const indentOf = (s) => /^\s*/.exec(s)[0].length;

const misrouted = [];   // { line, type, attr, value, route }
const unknownType = []; // { line, type }
const noRow = new Set();// types present in the bundle but absent from the table

let cur = null;         // { type, start, body[] }

// Split the file into definition blocks. Column 0 starts a block; blank lines
// and comments before the first definition are ignored.
for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const d = defRe.exec(raw);
  if (d) {
    if (cur) { analyze(); }
    const head = d[2].trim();
    // [Collection: Report: JpX] -> the interface type is Collection, not Report.
    const sub = /^([A-Za-z]+)\s*:/.exec((d[3] ?? '').trim());
    const canonical = sub && KNOWN_SUBS.has(sub[1]) ? `${head}: ${sub[1]}` : head;
    cur = { type: head, canonical, sub: (d[3] ?? '').trim(), start: i + 1, body: [] };
    if (!REAL_TYPES.has(head)) {
      unknownType.push({ line: i + 1, type: `${head}: ${(d[3] ?? '').trim()}` });
    }
    continue;
  }
  if (/^\S/.test(raw) && raw.trim() && stmtRe.test(raw)) {
    if (cur) { analyze(); cur = null; }
    continue;
  }
  if (cur) cur.body.push({ line: i + 1, raw });
}

if (cur) analyze();

function analyze() {
  const { type, canonical, sub, body } = cur;
  if (!type) return;

  // [System: UDF] bodies are free-form "Name : DataType : Index" declarations,
  // not attributes of System. See TDL-SPEC.md section 5.
  if (type === 'System' && /^UDF$/i.test(sub)) return;

  const real = body
    .filter((b) => b.raw.trim() && !b.raw.trim().startsWith(';'))
    .map((b) => indentOf(b.raw));
  if (!real.length) return;
  const base = Math.min(...real);

  let parent = null; // { indent, name, inline }
  for (const { line, raw } of body) {
    const t = raw.trim();
    if (!t || t.startsWith(';')) continue;
    const ind = indentOf(raw);
    const name = attrName(t);
    if (!name) { parent = null; continue; }

    const value = t.slice(name.length + 1).trim();
    const inline = /<[^>]*>/.test(value);

    // Owner of THIS attribute.
    let owner;
    if (ind <= base) owner = canonical;
    else if (parent && ind > parent.indent && !parent.inline) owner = null; // nested sub-attr
    else owner = canonical;                                              // <- the inline-<...> case

    parent = { indent: ind, name, inline };

    if (owner === null) continue;
    if (!ATTRS.has(owner)) { noRow.add(owner); continue; }

    const row = ATTRS.get(owner);
    if (row.names.includes(name.toLowerCase())) continue;

    misrouted.push({ line, type: owner, attr: name, value, route: routeFor(owner, name) });
  }
}

// ----------------------------------------------------------------- report
const byType = new Map();
for (const m of misrouted) {
  const k = `${m.type}`;
  if (!byType.has(k)) byType.set(k, new Map());
  const g = byType.get(k);
  const kk = m.attr;
  g.set(kk, (g.get(kk) || 0) + 1);
}

console.log(`file: ${FILE}`);
console.log(`misrouted attributes: ${misrouted.length}`);
console.log('');
for (const [type, g] of [...byType].sort((a, b) => a[0].localeCompare(b[0]))) {
  const total = [...g.values()].reduce((a, b) => a + b, 0);
  console.log(`[${type}]  ${total}`);
  for (const [attr, n] of [...g].sort((a, b) => b[1] - a[1])) {
    const r = routeFor(type, attr);
    const tag = r ? (r.hold ? `  HOLD (${r.why || 'context-dependent'})`
                           : `  -> [${r.to}] ${r.as}`) : '  (no route)';
    console.log(`   ${String(n).padStart(5)}  ${attr}${tag}`);
  }
  console.log('');
}

if (unknownType.length) {
  const g = new Map();
  for (const u of unknownType) g.set(u.type.split(/\s+/)[0], (g.get(u.type.split(/\s+/)[0]) || 0) + 1);
  console.log(`T0006 class - definition types that are not Tally types: ${unknownType.length}`);
  for (const [t, n] of [...g].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(5)}  [${t}]`);
  console.log('');
}

// A type absent from the table is a harness gap ONLY if Tally actually has it.
// Print / Screen / Export / Keys are absent because Tally does NOT have them -
// that is the T0006 class reported above, a real error, not a blind spot.
const t0006 = new Set(unknownType.map((u) => u.type.split(':')[0].trim()));
const realGap = [...noRow].filter((t) => !t0006.has(t.split(':')[0].trim()));

if (noRow.size) {
  const gap = realGap.length ? realGap.join(', ') : '(none - all are T0006-class types)';
  console.log(`HARNESS GAP - no table row for: ${gap}`);
  console.log('');
}

process.exit(realGap.length ? 2 : (misrouted.length || unknownType.length) ? 1 : 0);