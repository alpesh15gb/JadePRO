#!/usr/bin/env node
// route-line-to-field.mjs
//
// WHY
//   lint-attributes.mjs reports 1,903 attributes sitting on [Line:] that the
//   Line definition does not accept. Tally agrees: error T0014, "Incorrect
//   attribute 'Width' is used for the definition 'Line'", JadePro.tdl:1274.
//
//   The fix is not to delete them. Width, Style, Align, Color, Format, Dynamic,
//   Skip and Background are all real - they belong to the Field that lives in
//   that Line. `Text:` is not real anywhere; the reference renders literal text
//   with `Set As: "..."` on a Field (the Field page's own example is
//   `[Field: TSPL Terms] Use : Name Field / Set as : "Terms & Conditions"`).
//
//   TallyHelp's Line page publishes its attributes in four groups - RepeatedTotal,
//   LineFormat, Output, Input - and Text, Style, Font, Align, Width, Color,
//   Title and Paper appear in none of them. Font is not on Field either: Style
//   has exactly four attributes (Font, Height, Bold, Italic) and is used from
//   Field only.
//
// WHAT
//   For each [Line: NAME] whose attributes are not all Line-legal:
//
//     [Line: NAME]                        [Line: NAME]
//         Text: "hello"                       Style: JpGridHead
//         Style: JpGridHead       -->          Field: NAMEF1
//         Width: 8                         [Field: NAMEF1]
//                                             Set As : "hello"
//                                             Style : JpGridHead
//                                             Width : 8
//
//   Named Field definitions are used rather than the inline `Field: <...>` form,
//   because the compiler has already shown that an inline definition does not
//   open an indentation sub-level - anything indented under it belongs to the
//   Line. Every reference example uses a named Field.
//
//   A `Font:` on a Line becomes a generated [Style:] plus `Style:` on the Field.
//   Font tokens are deduplicated into shared styles (BOLD -> JpFontBOLD).
//
//   `Line Height: 1` is renamed to `Height: 1`, which Line does accept.
//
// IDEMPOTENT
//   A second run finds no [Line:] with an attribute the table rejects and no-ops.
//
// USAGE
//   node route-line-to-field.mjs [dir]     (default: tdl)

import fs from 'node:fs';
import path from 'node:path';
import { ATTRS } from './tdl-attributes.mjs';

const DIR = path.resolve(process.argv[2] || 'tdl');
const IND = '    ';

const lineOk = new Set(ATTRS.get('Line').names);

// Attributes that move onto the Field, and the Field attribute they become.
const TO_FIELD = new Map([
  ['style', 'Style'], ['align', 'Align'], ['width', 'Width'],
  ['color', 'Color'], ['colour', 'Color'], ['format', 'Format'],
  ['dynamic', 'Dynamic'], ['skip', 'Skip'], ['background', 'Background'],
  ['border', 'Border'], ['not', 'Not'], ['full width', 'Full Width'],
]);

const indentOf = (s) => /^\s*/.exec(s)[0].length;
const attrOf = (s) => {
  const m = /^([A-Za-z][A-Za-z0-9 ]*?)\s*:\s*(.*)$/.exec(s.trim());
  return m ? { name: m[1], value: m[2].trim() } : null;
};

// `Font: BOLD` is not a font name - Style has Font, Height, Bold and Italic, so
// a weight keyword becomes Bold/Italic and anything else is taken literally.
const styleBody = (tok) => {
  const t = tok.trim().replace(/^["']|["']$/g, '');
  if (/^bold$/i.test(t)) return ['Bold : Yes'];
  if (/^italic$/i.test(t)) return ['Italic : Yes'];
  return [`Font : ${tok}`];
};
const styleKey = (tok) => tok.trim().replace(/^["']|["']$/g, '').toUpperCase();
const styleName = (tok) =>
  'JpFont' + styleKey(tok).toLowerCase().replace(/(^|[^a-z0-9])([a-z])/g, (_, a, b) => b.toUpperCase());
const generatedStyles = new Map();     // token -> style name
const newStyles = [];                  // emitted style bodies, in first-seen order

let touchedLines = 0, touchedFiles = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()) {
  const p = path.join(DIR, f);
  const src = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const out = [];
  let i = 0, fileTouched = 0;

  while (i < src.length) {
    const head = /^\[Line:\s*([^\]]+)\]\s*$/.exec(src[i]);
    if (!head) { out.push(src[i]); i++; continue; }

    const name = head[1].trim();
    const body = [];
    let j = i + 1;
    for (; j < src.length; j++) {
      const L = src[j];
      if (/^\S/.test(L) && L.trim() && !L.trim().startsWith(';')) break;
      body.push({ line: j + 1, raw: L });
    }

    const top = body.filter((b) => b.raw.trim() && !b.raw.trim().startsWith(';'));
    if (!top.length) { out.push(src[i]); for (const b of body) out.push(b.raw); i = j; continue; }
    const base = Math.min(...top.map((b) => indentOf(b.raw)));

    // Ownership must match lint-attributes.mjs exactly: indentation opens a
    // sub-level EXCEPT under an inline `<...>` definition, which is single-line.
    // T0014 at JadePro.tdl:1274 is the proof - `Width` indented under
    // `Field: <...>` was reported against the Line, not the Field.
    const parsed = [];
    let parent = null;
    for (const b of body) {
      const t = b.raw.trim();
      if (!t || t.startsWith(';')) { parsed.push({ ...b, kind: 'raw' }); continue; }
      const a = attrOf(b.raw);
      const ind = indentOf(b.raw);
      const owned = !parent || ind <= parent.indent || parent.inline;
      parsed.push(a && owned ? { ...b, kind: 'attr', ...a } : { ...b, kind: 'sub' });
      parent = a ? { indent: ind, inline: /^<.*>$/.test(a.value) } : null;
    }

    // Nothing to do when every top-level attribute is Line-legal and there is
    // no Text starter. That is the idempotence guard.
    const attrs = parsed.filter((p) => p.kind === 'attr');
    const needsWork = attrs.some((a) =>
      a.name.toLowerCase() === 'text' ||
      a.name.toLowerCase() === 'font' ||
      a.name.toLowerCase() === 'line height' ||
      !lineOk.has(a.name.toLowerCase()));

    if (!needsWork) { out.push(src[i]); for (const b of body) out.push(b.raw); i = j; continue; }

    // Split the top-level attributes into: stays on the Line, moves to the
    // Field, becomes a Style, or is a Text literal / inline Field payload.
    const stay = [], toField = [];
    let textValue = null, fontValue = null, inlinePayload = null, renamed = [];

    for (const p of parsed) {
      if (p.kind !== 'attr') continue;   // comments and blank lines carry over via stay
      const key = p.name.toLowerCase();

      if (key === 'text') { textValue = p.value; continue; }

      if (key === 'font') { fontValue = p.value; continue; }

      if (key === 'line height') {
        stay.push({ ...p, name: 'Height', value: p.value });
        continue;
      }

      if (key === 'field') {
        const m = /^<(.+)>$/.exec(p.value);
        if (m) {
          // Field-Id is the only invented name in this payload; the reference
          // stores a value on a Field with Storage.
          inlinePayload = m[1].trim().split(/\s*,\s*/).map((kv) => {
            const mm = /^([A-Za-z][A-Za-z0-9 _-]*?)\s*:\s*(.*)$/.exec(kv.trim());
            if (!mm) return kv.trim();
            if (mm[1].toLowerCase() === 'field-id') return `Storage : ${mm[2].trim()}`;
            return `${mm[1].trim()} : ${mm[2].trim()}`;
          });
        } else {
          // A plain `Field: SomeName` reference: the Line owns it, nothing to move.
          stay.push(p);
        }
        continue;
      }

      if (TO_FIELD.has(key)) { toField.push({ ...p, name: TO_FIELD.get(key) }); continue; }

      // Not Line-legal and no route: keep it visible rather than guess. The
      // oracle will list it again, which is the point.
      stay.push(p);
    }

    // Nothing actually moved (e.g. a Line carrying only Paper/Title/Margin, which
    // have no route): emit the block untouched. Without this guard the script
    // would append a fresh `Field: <name>F1` on every run, duplicating names.
    if (!toField.length && textValue === null && !fontValue && !inlinePayload) {
      out.push(src[i]);
      for (const b of body) out.push(b.raw);
      i = j;
      continue;
    }

    const fieldName = `${name}F1`;

    out.push(src[i]);
    // Line keeps only what Line accepts; it references the generated Field.
    for (const s of stay) out.push(`${IND}${s.name} : ${s.value}`);
    out.push(`${IND}Field: ${fieldName}`);

    // The Field definition.
    out.push('');
    out.push(`[Field: ${fieldName}]`);
    if (inlinePayload) for (const kv of inlinePayload) out.push(`${IND}${kv}`);
    if (textValue !== null) out.push(`${IND}Set As : ${textValue}`);
    if (fontValue) {
      if (!generatedStyles.has(styleKey(fontValue))) {
        const sn = styleName(fontValue);
        generatedStyles.set(styleKey(fontValue), sn);
        newStyles.push(`[Style: ${sn}]\n${IND}${styleBody(fontValue).join(`\n${IND}`)}`);
      }
      out.push(`${IND}Style : ${generatedStyles.get(styleKey(fontValue))}`);
    }
    for (const t of toField) out.push(`${IND}${t.name} : ${t.value}`);

    fileTouched++; touchedLines++;
    i = j;
  }

  if (fileTouched) {
    fs.writeFileSync(p, out.join('\n'));
    console.log(`${f}: ${fileTouched} Line block(s) routed`);
    touchedFiles++;
  }
}

// All generated styles go into ONE module. They are shared across modules, and
// build.sh fails the bundle on a duplicate definition name, so emitting them
// per file would break the build.
if (newStyles.length) {
  const coreName = fs.existsSync(path.join(DIR, '00_Core.tdl')) ? '00_Core.tdl' : null;
  const target = coreName || fs.readdirSync(DIR).filter((x) => x.endsWith('.tdl')).sort()[0];
  const tp = path.join(DIR, target);
  const body = fs.readFileSync(tp, 'utf8').replace(/\s+$/, '');
  fs.writeFileSync(tp, [
    body,
    '',
    '; --- styles generated by route-line-to-field.mjs from Line Font: attributes ---',
    ...newStyles.flatMap((s) => s.split('\n')),
    '',
  ].join('\n'));
  console.log(`${target}: ${newStyles.length} generated style(s) written once`);
}

console.log(`total: ${touchedLines} Line definition(s) in ${touchedFiles} file(s); ` +
            `${generatedStyles.size} generated style(s)`);