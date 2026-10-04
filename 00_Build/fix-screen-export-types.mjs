#!/usr/bin/env node
// fix-screen-export-types.mjs
//
// WHY
//   With Line and Style clean, Tally advanced to a new error class:
//
//       error T0006: The definition type is misspelt or incorrect.
//       "D:\Jewel Pro\JadePro.tdl"(2366)
//
//   Line 2366 is `[Screen: JpItemCreateScreen]`. `Screen` is not a Tally
//   definition type. Neither is `Export`. A census of the bundle finds these
//   and no others:
//
//       15 [Screen:]   1,058 body lines
//       30 [Export:]     691 body lines
//
//   Both were invented by an earlier generator. Tally has no `[Screen:]`; a
//   data-entry screen is a Report driving a Form. Tally has no `[Export:]`
//   either; bulk data output is a Report declared `Plain XML` whose Parts,
//   Lines and Fields carry XMLTag / XMLAttr. Probes p29 and p30 exist to settle
//   exactly this, and neither has been run.
//
//   These are NOT dead code. All 45 are wired up:
//     - 15 Screens are reached from [Menu: JpMainMenu] via `Display:` and three
//       more from [Function:] bodies via `Alter:`.
//     - 30 Exports are reached from their [Collection: Report:] via `Export:`.
//   So the reference sites are kept working by keeping the definition NAMES
//   unchanged: `Display: JpItemCreateScreen` resolves just as happily to a
//   Report as to whatever it thought it was pointing at. Nothing else to edit.
//
// WHAT - [Screen:] becomes Report + Form + Part
//
//     [Report: JpItemCreateScreen]        <- new; carries the old Caption
//         Title : "..."
//         Form : JpItemCreateScreenForm
//     [Form: JpItemCreateScreenForm]
//         Parts : JpItemCreateScreenPart
//     [Part: JpItemCreateScreenPart]
//         <the old body, minus what Part cannot hold>
//
//   The body was already Part grammar - Part accepts `line` (75), `lines` (113),
//   `field` (137) and `button` (51) - so it moves across unchanged apart from
//   five attributes.
//
//   `Text:` (124) is the one real conversion. Part has no `text`; literal text
//   on a Tally layout is a Field whose Set As is the string. The bodies use a
//   very regular shape, verified across all 15 screens before writing this:
//
//       base-indent Style:  94     == exactly the number of "Text then Style"
//       Text:             124     = 94 paired + 30 that begin a longer run
//
//   i.e. a run of one-or-more consecutive Text lines, optionally closed by a
//   single Style. That maps one-for-one onto a run of generated Fields:
//
//       Lines: 1, 1, 1
//       Text: "a"                       [Field: XScreenT1]
//       Text: "b"            ==>        Set As : "a"
//       Text: "c"                       [Field: XScreenT2]
//       Style: JpMuted                   Set As : "b"
//                                      [Field: XScreenT3]
//                                          Set As : "c"
//                                          Style : JpMuted
//
//   The Style moves onto the generated Fields, which is exactly where it
//   belonged: Field accepts `style`, Part does not.
//
//   Dropped, each with a comment recording why:
//     Caption     15  -> moved to the Report's Title, its real home
//     Key         15  -> Part has no Key; this was <Ctrl+Q: System: Quit>,
//                        which a Menu Item carries, not a layout
//     Line Height 15  -> `Height` on a Part means the height of the whole part,
//                        not of each line. Routing it there would change what
//                        the screen looks like, so it is dropped rather than
//                        silently reinterpreted.
//
// WHAT - [Export:] becomes Report + Form + Part + Line + Fields
//
//     [Report: JpKarigarOutstandingExport]
//         Title : <1000, "Karigar Outstanding">
//         Plain XML : Yes
//         Export Header : Yes
//         Repeat : Over : JpKarigarOutstanding
//         Form : JpKarigarOutstandingExportForm
//     [Form: ...ExportForm]
//         Parts : ...ExportPart
//     [Part: ...ExportPart]
//         XMLTag : "Row"
//         Lines : ...ExportLine
//     [Line: ...ExportLine]
//         Field : ...ExportF1 ...   (one per Export: Value:)
//     [Field: ...ExportF1]
//         Set As : $JwlJobKarigar
//         XMLAttr : "JwlJobKarigar"
//
//   `Export: Value: X` (244 sites) was invented syntax with no TDL equivalent.
//   Each one becomes a Field that sets the SAME payload verbatim. The payloads
//   are not uniform, and the tag name is derived per shape:
//
//       136   $$NAME                 variable-store reference
//        87   $Name                  collection column
//        13   Fn()                   zero-arg call, all in the Zebra module
//         8   Fn("a", 2)             call with arguments, same
//
//   The payload is never rewritten - `Set As` takes exactly what was there, so
//   nothing is reinterpreted. Only the tag name is derived: leading `$`
//   characters are stripped, and for a call the bare function name is used
//   (JpZplNum("shopY", 2) -> XMLAttr : "JpZplNum", which repeats where one
//   function is emitted several times; that is cosmetic in XML only).
//
//   `Repeat: Over: X` is left VERBATIM on the Report. Report accepts `repeat`,
//   so it is already legal there and needs no reinterpretation - the earlier
//   draft of this script rewrote it to `Fetch Collection`, which was invention
//   with nothing to gain. If Tally wants a different binding it will name the
//   attribute in the error and it is a one-line change.
//
//   `Export Title: Detail` (30) is dropped: Report has `Export Header`, and a
//   detail-vs-header switch is not a Part-level concept.
//
// CAUTION - the Export half is the least certain part of this pass
//   Screen is high confidence: Part demonstrably accepts the bulk of the body.
//   Export is a shape read off p29, which has never been loaded. The attribute
//   vocabulary is real TDL, but note that 21 of the 244 payloads are function
//   calls feeding the Zebra ZPL pipeline, and probe p06 already warns that if
//   [Export:] turns out to be unusable "the CSV has to come from elsewhere - a
//   redesign, not a syntax patch". Plain XML is the only TDL mechanism
//   available, so it is used, but treat the next Tally error as possibly
//   belonging to this pass.
//
//   The Collection's own `Export: <name>` attribute is NOT touched here and is
//   itself not a Collection attribute; that is the next error class and Tally
//   will only report it once these two stop blocking.
//
// IDEMPOTENT
//   A second run finds no [Screen:] or [Export:] header and no-ops.
//
// USAGE
//   node fix-screen-export-types.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'tdl');
const IND = '    ';                       // matches the existing module indentation
const BANNER = '; ---------- fixed-screen-export-types.mjs ----------';

const stats = {
  screens: 0, exports: 0, textFields: 0, valueFields: 0,
  caption: 0, key: 0, lineHeight: 0, exportTitle: 0, repeat: 0,
};

// A block runs from its header to the next column-0 line that is neither blank
// nor a `;` comment. Definitions here are all written at column 0.
function blockEnd(lines, start) {
  for (let i = start + 1; i < lines.length; i++) {
    const L = lines[i];
    if (/^\S/.test(L) && !L.trim().startsWith(';')) return i;
  }
  return lines.length;
}

// Base indent = indent of the block's first attribute line.
function baseIndent(body) {
  for (const L of body) {
    const a = /^(\s+)[A-Za-z]/.exec(L);
    if (a) return a[1].length;
  }
  return IND.length;
}

const attrRe = /^(\s*)([A-Za-z][A-Za-z0-9 -]*?)\s*:\s*(.*)$/;

/* ------------------------------------------------------------------ Screen */

function rewriteScreen(lines, start, end) {
  const header = /^\s*\[Screen:\s*([^\]]+)\]/.exec(lines[start]);
  const name = header[1].trim();
  const body = lines.slice(start + 1, end);
  const base = baseIndent(body);

  let caption = null;
  const outBody = [];
  const fields = [];
  let run = [];                 // pending Text run

  const flushRun = () => {
    if (!run.length) return;
    for (const t of run) {
      const fname = `${name}T${fields.length + 1}`;
      outBody.push(`${IND}Field : ${fname}`);
      fields.push({ name: fname, value: t.value, style: t.style });
      stats.textFields++;
    }
    run = [];
  };

  for (const L of body) {
    const a = attrRe.exec(L);
    const isOwn = a && a[1].length === base;

    if (isOwn && a[2].trim().toLowerCase() === 'text') {
      run.push({ value: a[3], style: null });
      continue;
    }
    // A Style directly after a Text run styles that whole run.
    if (isOwn && a[2].trim().toLowerCase() === 'style' && run.length) {
      const last = run[run.length - 1];
      last.style = a[3].trim();
      // propagate to every line of the run, the run shares one style
      for (const t of run) t.style = a[3].trim();
      continue;
    }

    flushRun();

    if (!isOwn) { outBody.push(L); continue; }

    const key = a[2].trim().toLowerCase();
    switch (key) {
      case 'caption':
        caption = a[3].trim();
        stats.caption++;
        outBody.push(`${IND}; Caption moved to the Report's Title by fix-screen-export-types.mjs`);
        break;
      case 'key':
        stats.key++;
        outBody.push(`${IND}; Key dropped by fix-screen-export-types.mjs - Part has no Key;`);
        outBody.push(`${IND}; this was a menu-level shortcut, not a layout attribute.`);
        break;
      case 'line height':
        stats.lineHeight++;
        outBody.push(`${IND}; Line Height dropped by fix-screen-export-types.mjs - Part: Height`);
        outBody.push(`${IND}; means the height of the whole Part, not of each Line.`);
        break;
      default:
        outBody.push(L);
    }
  }
  flushRun();

  const title = caption || `${name}`;
  const parts = [
    `[Report: ${name}]`,
    `${IND}Title : ${title}`,
    `${IND}Form : ${name}Form`,
    '',
    `[Form: ${name}Form]`,
    `${IND}Parts : ${name}Part`,
    '',
    `${BANNER}`,
    `${IND}; [Screen:] is not a Tally definition type. The body below was already`,
    `${IND}; Part grammar, so it became a Part behind a Report + Form.`,
    `[Part: ${name}Part]`,
    ...outBody,
  ];

  if (fields.length) {
    parts.push('', `${IND}; Text: lines become Fields - Part has no Text attribute.`);
    for (const f of fields) {
      parts.push('', `[Field: ${f.name}]`, `${IND}Set As : ${f.value}`);
      if (f.style) parts.push(`${IND}Style : ${f.style}`);
    }
    parts.push('');
  }

  stats.screens++;
  return parts;
}

/* ------------------------------------------------------------------ Export */

// The XML tag name for an `Export: Value:` payload. The payload itself is never
// rewritten - only the tag is derived. Leading `$`s are stripped; a call
// contributes its bare function name (JpZplNum("shopY", 2) -> "JpZplNum").
function tagFor(value) {
  const bare = value.replace(/^\$+/, '');
  const call = /^([A-Za-z][A-Za-z0-9_]*)\s*\(/.exec(bare);
  if (call) return call[1];
  const ident = /^([A-Za-z0-9_]+)/.exec(bare);
  return ident ? ident[1] : bare.replace(/[^\w]/g, '_');
}

function rewriteExport(lines, start, end) {
  const header = /^\s*\[Export:\s*([^\]]+)\]/.exec(lines[start]);
  const name = header[1].trim();
  const body = lines.slice(start + 1, end);

  const head = [];
  const values = [];
  const outBody = [];

  for (const L of body) {
    const a = attrRe.exec(L);
    if (!a || a[1].trim()) { outBody.push(L); continue; }   // keep nested / non-attr lines

    const key = a[2].trim().toLowerCase();
    const val = a[3].trim();

    if (key === 'title') { head.push(`${IND}Title : ${val}`); continue; }
    if (key === 'repeat') { head.push(`${IND}${L.trim()}`); stats.repeat++; continue; }
    if (key === 'export title') { stats.exportTitle++; continue; }
    if (key === 'export') {
      const v = /^Value:\s*(.+)$/i.exec(val);
      if (v) { values.push({ value: v[1].trim(), tag: tagFor(v[1].trim()) }); continue; }
    }
    outBody.push(L);
  }

  const parts = [
    `[Report: ${name}]`,
    ...head,
    `${IND}Plain XML : Yes`,
    `${IND}Export Header : Yes`,
    `${IND}Form : ${name}Form`,
    '',
    `[Form: ${name}Form]`,
    `${IND}Parts : ${name}Part`,
    '',
    `${BANNER}`,
    `${IND}; [Export:] is not a Tally definition type. Bulk output is a Report`,
    `${IND}; declared Plain XML, with XMLTag on the Part and XMLAttr on the Fields.`,
    `${IND}; "Export Title: Detail" (30 sites) was dropped - Report has Export Header,`,
    `${IND}; and detail-vs-header is not a Part-level concept.`,
    `[Part: ${name}Part]`,
    `${IND}XMLTag : "Row"`,
    `${IND}Lines : ${name}Line`,
    '',
    `[Line: ${name}Line]`,
    ...values.map((_, i) => `${IND}Field : ${name}F${i + 1}`),
  ];

  if (values.length) {
    parts.push('', `${IND}; "Export: Value:" had no TDL equivalent. Each became a Field`);
    parts.push(`${IND}; setting the same payload verbatim; the tag name is derived from it.`);
    values.forEach((v, i) => {
      parts.push('', `[Field: ${name}F${i + 1}]`, `${IND}Set As : ${v.value}`, `${IND}XMLAttr : "${v.tag}"`);
      stats.valueFields++;
    });
    parts.push('');
  }

  // anything left over from the old body that we did not consume
  const leftover = outBody.filter(L => !/^\s*;/.test(L) && L.trim() && !L.startsWith(IND));
  if (leftover.length) {
    parts.push('', `${IND}; carried over verbatim from the old [Export:] body:`);
    leftover.forEach(L => parts.push(`${IND};   ${L.trim()}`));
  }

  stats.exports++;
  return parts;
}

/* --------------------------------------------------------------------- run */

let files = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const out = [];
  let hit = false;

  for (let i = 0; i < lines.length;) {
    // Anchored to the opening bracket, so the `; [Screen:] is not a Tally...`
    // comments this script itself writes are not mistaken for definitions on a
    // second run. Without the anchor the second run crashes.
    const isScreen = /^[ \t]*\[Screen:/.test(lines[i]);
    const isExport = /^[ \t]*\[Export:/.test(lines[i]);

    if (!isScreen && !isExport) { out.push(lines[i]); i++; continue; }

    const end = blockEnd(lines, i);
    out.push(...(isScreen ? rewriteScreen(lines, i, end) : rewriteExport(lines, i, end)));
    hit = true;
    i = end;
  }

  if (hit) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: rewritten`);
    files++;
  }
}

console.log(`\n[Screen:] -> Report+Form+Part : ${stats.screens}`);
console.log(`   Text: -> generated Fields : ${stats.textFields}`);
console.log(`   Caption -> Report Title   : ${stats.caption}`);
console.log(`   Key dropped               : ${stats.key}`);
console.log(`   Line Height dropped       : ${stats.lineHeight}`);
console.log(`\n[Export:] -> Report+Form+Part+Line+Fields : ${stats.exports}`);
console.log(`   Export: Value: -> Fields  : ${stats.valueFields}`);
console.log(`   Repeat kept on the Report  : ${stats.repeat}`);
console.log(`   Export Title dropped      : ${stats.exportTitle}`);
console.log(`\nfiles: ${files}`);
