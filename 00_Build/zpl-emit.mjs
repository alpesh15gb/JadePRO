#!/usr/bin/env node
/**
 * zpl-emit.mjs - JadePro Zebra label emitter
 *
 * Turns the CSV exported from Tally's "Zebra Label Print Queue" into real
 * ZPL II files, one per label, ready for a Zebra printer.
 *
 * WHY A SCRIPT AND NOT TDL
 *   A Zebra printer speaks ZPL II, not PDF and not Tally's print language.
 *   Emitting it requires writing a file to disk, and TDL can do neither that
 *   nor open a printer port. Tally's only outputs are its print engine and its
 *   XML interface. So Tally produces the label SPECIFICATION (see
 *   tdl/08b_BarcodeZPL.tdl) and this script performs the I/O.
 *
 * USAGE
 *   node zpl-emit.mjs labels.csv [options]
 *
 * OPTIONS
 *   -o, --out <dir>      output directory                (default ./zpl-out)
 *   -p, --profile <file> JSON profile overriding the CSV geometry
 *   -q, --quiet          no per-label console output
 *   -l, --lenient        warn (not fail) on rows whose field count differs
 *                        from the header. Only for hand-made CSVs.
 *   -h, --help           this text
 *
 * GEOMETRY PRECEDENCE  (highest wins)
 *   1. --profile JSON          2. CSV columns (Tally profile)     3. built-in defaults
 *
 * BUILT-IN DEFAULTS ARE 203 dpi, 54 x 28 mm - a common desktop unit.
 * Every value is overridable; nothing about the printer is hard-coded.
 *
 * CSV COLUMNS (names must match tdl/08b_BarcodeZPL.tdl's Export section)
 *   ZplBarcode ZplItem ZplDesign ZplCategory ZplMetal ZplPurity
 *   ZplGrossWt ZplStoneWt ZplNetWt ZplCarat ZplHuid ZplMrp
 *   ZplShop ZplAddr ZplWeightLine ZplPurityLine ZplMrpLine
 *   ZplDpi ZplLabelW ZplLabelH ZplDarkness ZplSpeed ZplCopies
 *   ZplBcY ZplBcH ZplShopY ZplItemY ZplDesY ZplPurY ZplWtY ZplHuidY ZplMrpY
 *
 * The Zpl* prefixed geometry columns are OPTIONAL. A CSV with only the label
 * data still works - the defaults fill in the rest. That keeps this emitter
 * usable against a hand-made CSV during testing.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Defaults: 203 dpi target, standard jewellery counter tag.
// ---------------------------------------------------------------------------
// These MUST stay in step with JpZplDefaultProfile in tdl/08b_BarcodeZPL.tdl.
// The vertical layout is a collision-free stack: every text row is laid out
// from the top with its own font height, and the barcode sits below the last
// one. shopY and itemY used to both be 28, which printed the shop name and
// the item name on top of each other.
const DEFAULTS = {
  dpi: 203,
  labelWidthMm: 54,
  labelLengthMm: 40,
  darkness: 12,      // ^MD 0..30
  speed: 4,          // ^PR inches/second
  copies: 1,         // ^PQ
  orientation: "N",  // ^BC N = normal
  // field origins, in DOTS
  bcY: 200, bcH: 64,
  shopY: 2, addrY: 34, itemY: 56, desY: 82, purY: 104, wtY: 126, huidY: 148, mrpY: 170,
  shopX: 30, addrX: 30, itemX: 30, desX: 30, purX: 30, wtX: 30, huidX: 30, mrpX: 30,
  bcX: 30,
  // font heights in dots
  shopFont: 30, addrFont: 20, itemFont: 24, bodyFont: 20, mrpFont: 24,
  barcodeInterpretation: true, // print the human-readable line under the bars
  // symbology: ^BC = Code 128, the symbology the Tally module also uses
  symbology: "BC",
  prefix: "",
};

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
let csvPath = null, outDir = join(HERE, "zpl-out"), profilePath = null, quiet = false, lenient = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
  else if (a === "-o" || a === "--out") outDir = resolve(argv[++i] ?? outDir);
  else if (a === "-p" || a === "--profile") profilePath = resolve(argv[++i]);
  else if (a === "-q" || a === "--quiet") quiet = true;
  else if (a === "-l" || a === "--lenient") lenient = true;
  else if (a.startsWith("-")) { console.error(`unknown option: ${a}`); printHelp(); process.exit(2); }
  else csvPath = resolve(a);
}
if (!csvPath) { console.error("error: no CSV given."); printHelp(); process.exit(2); }
if (!existsSync(csvPath)) { console.error(`error: CSV not found: ${csvPath}`); process.exit(2); }

let profile = { ...DEFAULTS };
// Keys the operator set explicitly on the command line. Recorded separately so
// they can WIN over the CSV columns - documented precedence is
// --profile > CSV > built-in defaults. Without this, a profile was silently
// ignored for every geometry the CSV also carried, which is all of them.
const profileOverrides = new Set();
if (profilePath) {
  if (!existsSync(profilePath)) { console.error(`error: profile not found: ${profilePath}`); process.exit(2); }
  const json = JSON.parse(readFileSync(profilePath, "utf8"));
  for (const k of Object.keys(json)) {
    if (!(k in DEFAULTS)) {
      console.error(`error: unknown profile key "${k}". Known keys: ${Object.keys(DEFAULTS).join(", ")}`);
      process.exit(2);
    }
    profileOverrides.add(k);
  }
  profile = { ...profile, ...json };
}

function printHelp() {
  console.log(`
zpl-emit.mjs - JadePro Zebra label emitter

  node zpl-emit.mjs <labels.csv> [-o <outdir>] [-p <profile.json>] [-q]

  -o, --out <dir>      output directory (default ./zpl-out)
  -p, --profile <file> JSON profile overriding CSV geometry
  -q, --quiet          suppress per-label output
  -l, --lenient        warn instead of fail on ragged CSV rows

  Point a Zebra hot folder (e.g. FolderMill) at <outdir> and labels print
  unattended as the .zpl files appear.
`);
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC4180-ish: quoted fields, embedded commas and newlines)
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
if (rows.length < 2) {
  console.error("error: CSV has a header but no label rows.");
  process.exit(1);
}
const header = rows[0].map((h) => h.trim());

// ---------------------------------------------------------------------------
// Ragged-row guard.
//
// A row with MORE fields than the header means at least one unquoted field
// contains a comma - classically ZplMrpLine = "MRP Rs. 48,500.00". Parsing
// still succeeds, but every geometry column after the break shifts by one:
// dpi becomes the MRP decimal, darkness becomes the label length, and so on.
// The result is a label that prints at the wrong size with the wrong darkness
// rather than an error - the worst possible failure for a live counter tag.
//
// So refuse to guess. Short rows are padded and long rows are rejected.
// ---------------------------------------------------------------------------
const ragged = [];
rows.slice(1).forEach((r, i) => {
  if (r.length !== header.length) ragged.push({ line: i + 2, fields: r.length });
});

if (ragged.length) {
  const detail = ragged
    .map((r) => `  line ${r.line}: ${r.fields} fields, header has ${header.length}`)
    .join("\n");
  const howto =
    "Usually an unquoted field containing a comma (e.g. an MRP amount).\n" +
    '  Quote it: "MRP Rs. 48,500.00"';
  if (lenient) {
    console.warn(`warning: ${ragged.length} ragged row(s), padding to header width:\n${detail}\n${howto}`);
  } else {
    console.error(
      `error: ${ragged.length} row(s) do not match the header width - geometry would be misread.\n` +
        `${detail}\n${howto}\n` +
        "  Re-export from Tally, fix the quoting, or pass --lenient to override."
    );
    process.exit(1);
  }
}

const data = rows
  .slice(1)
  .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));

if (!header.includes("ZplBarcode")) {
  console.error("error: CSV has no ZplBarcode column. Export from Jewellery > Zebra Label Print Queue.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------
const dotsPerMm = profile.dpi / 25.4;
const mmToDots = (mm) => Math.round(mm * dotsPerMm);
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// Per-row geometry. Precedence: --profile > CSV column > built-in default.
function geom(row) {
  const g = { ...profile };

  // Apply a CSV column unless the operator pinned that same key on the CLI.
  const take = (key, col) => {
    if (profileOverrides.has(key)) return;
    if (row[col]) g[key] = num(row[col], g[key]);
  };

  take("dpi", "ZplDpi");
  take("darkness", "ZplDarkness");
  take("speed", "ZplSpeed");
  take("copies", "ZplCopies");
  take("bcY", "ZplBcY");
  take("bcH", "ZplBcH");
  take("shopY", "ZplShopY");
  take("addrY", "ZplAddrY");
  take("itemY", "ZplItemY");
  take("desY", "ZplDesY");
  take("purY", "ZplPurY");
  take("wtY", "ZplWtY");
  take("huidY", "ZplHuidY");
  take("mrpY", "ZplMrpY");

  // Width/height differ: the CSV carries DOTS (what the printer needs),
  // the profile and defaults carry MILLIMETRES. Resolved after dpi so that
  // mmToDots uses the dpi that actually won.
  g.labelWidthDots = profileOverrides.has("labelWidthMm")
    ? mmToDots(g.labelWidthMm)
    : row.ZplLabelW
      ? num(row.ZplLabelW, mmToDots(g.labelWidthMm))
      : mmToDots(g.labelWidthMm);
  g.labelLengthDots = profileOverrides.has("labelLengthMm")
    ? mmToDots(g.labelLengthMm)
    : row.ZplLabelH
      ? num(row.ZplLabelH, mmToDots(g.labelLengthMm))
      : mmToDots(g.labelLengthMm);
  return g;
}

// ---------------------------------------------------------------------------
// layout self-check
//
// Field Y values are hand-tuned per printer, so it is easy to stack two
// fields on the same line and get a garbled label with no error anywhere.
// Cheap to check, so check it: flag overlapping bands and anything that runs
// past the bottom of the label.
// ---------------------------------------------------------------------------
function checkLayout(g, texts) {
  const bands = texts
    .map((t) => ({ name: t.name, y: t.y, h: t.font }))
    .filter((b) => b.y != null && b.name)
    .sort((a, b) => a.y - b.y);

  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1];
    const cur = bands[i];
    if (cur.y < prev.y + prev.h) {
      console.warn(
        `warning: fields "${prev.name}" and "${cur.name}" overlap ` +
          `(${prev.name} spans ${prev.y}..${prev.y + prev.h}, ${cur.name} starts ${cur.y}).`
      );
    }
  }

  const bottom = Math.max(...bands.map((b) => b.y + b.h), g.bcY + g.bcH);
  if (bottom > g.labelLengthDots) {
    console.warn(
      `warning: content reaches ${bottom} dots but the label is only ` +
        `${g.labelLengthDots} dots long. Increase h= or move fields up.`
    );
  }
}

// ---------------------------------------------------------------------------
// ZPL
// ---------------------------------------------------------------------------

// ZPL treats these as format prefixes. Stripping them prevents a stray
// "^FF" or "^FN" in an address from corrupting the label.
const safe = (s) => String(s ?? "").replace(/[\^~]/g, " ").trim();

function textField(x, y, text, height) {
  if (!text) return "";
  // ^A0N = scalable font A, normal orientation
  return `^FO${x},${y}^A0N,${height},${height}^FD${safe(text)}^FS\n`;
}

// ^BC = Code 128.  orientation,height,print-interpretation-line,above,
//                   check-digit,mode
function code128Field(x, y, data, height, interpretation, orientation) {
  if (!data) return "";
  const interp = interpretation ? "Y" : "N";
  return `^FO${x},${y}^${symbologyOf()}N,${height},${interp},N,N,m^FD${safe(data)}^FS\n`;
}

let currentSymbology = DEFAULTS.symbology;
const symbologyOf = () => currentSymbology;

function buildZpl(row, index) {
  const g = geom(row);
  currentSymbology = g.symbology || "BC";

  const shop = row.ZplShop || "";
  const addr = row.ZplAddr || "";
  const purity = row.ZplPurityLine || [row.ZplPurity, row.ZplMetal].filter(Boolean).join(" ");
  const weights = row.ZplWeightLine || `G ${row.ZplGrossWt ?? ""}  N ${row.ZplNetWt ?? ""}  S ${row.ZplStoneWt ?? ""}`;
  const mrp = row.ZplMrpLine || (row.ZplMrp ? `MRP Rs. ${row.ZplMrp}` : "");
  const design = row.ZplDesign ? `Design: ${row.ZplDesign}` : "";
  const huid = row.ZplHuid ? `HUID: ${row.ZplHuid}` : "";

  let zpl = "";
  zpl += "^XA\n";
  // media and print width, label length
  zpl += `^PW${g.labelWidthDots}\n`;
  zpl += `^LL${g.labelLengthDots}\n`;
  // ^LH would offset everything; keep coordinates absolute so the per-field
  // Y values from Tally mean exactly what they say.
  // print quality
  zpl += `^MD${g.darkness}\n`;
  zpl += `^PR${g.speed}\n`;
  // label content
  zpl += textField(g.shopX, g.shopY, shop, g.shopFont);
  zpl += textField(g.addrX, g.addrY, addr, g.addrFont);
  zpl += textField(g.itemX, g.itemY, row.ZplItem || "", g.itemFont);
  zpl += textField(g.desX, g.desY, design, g.bodyFont);
  zpl += textField(g.purX, g.purY, purity, g.bodyFont);
  zpl += textField(g.wtX, g.wtY, weights, g.bodyFont);
  zpl += textField(g.huidX, g.huidY, huid, g.bodyFont);
  zpl += textField(g.mrpX, g.mrpY, mrp, g.mrpFont);
  // the barcode itself
  zpl += code128Field(g.bcX, g.bcY, row.ZplBarcode, g.bcH, g.barcodeInterpretation, g.orientation);
  // copies
  zpl += `^PQ${g.copies},0,1,N\n`;
  zpl += "^XZ\n";
  return zpl;
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });

let written = 0, skipped = 0;
const manifest = [];
data.forEach((row, i) => {
  if (!row.ZplBarcode) {
    skipped++;
    if (!quiet) console.warn(`  row ${i + 2}: no ZplBarcode - skipped (mint one in Tally first)`);
    return;
  }
  const name = `label-${String(i + 1).padStart(4, "0")}-${safe(row.ZplBarcode)}.zpl`;
  const file = join(outDir, name);
  const g = geom(row);
  checkLayout(g, [
    { name: "shop", y: g.shopY, font: g.shopFont },
    { name: "address", y: g.addrY, font: g.addrFont },
    { name: "item", y: g.itemY, font: g.itemFont },
    { name: "design", y: g.desY, font: g.bodyFont },
    { name: "purity", y: g.purY, font: g.bodyFont },
    { name: "weights", y: g.wtY, font: g.bodyFont },
    { name: "huid", y: g.huidY, font: g.bodyFont },
    { name: "mrp", y: g.mrpY, font: g.mrpFont },
  ]);
  writeFileSync(file, buildZpl(row, i), "ascii");
  manifest.push(name);
  written++;
  if (!quiet) console.log(`  wrote ${name}`);
});

writeFileSync(join(outDir, "_manifest.txt"), manifest.join("\n") + "\n", "ascii");

const g0 = geom(data.find((r) => r.ZplBarcode) || {});
console.log(`\n  labels written : ${written}`);
console.log(`  skipped        : ${skipped}`);
console.log(`  output folder  : ${outDir}`);
const dpmm0 = g0.dpi / 25.4;
console.log(
  `  label          : ${g0.labelWidthDots} x ${g0.labelLengthDots} dots` +
    `  (${(g0.labelWidthDots / dpmm0).toFixed(1)} x ${(g0.labelLengthDots / dpmm0).toFixed(1)} mm @ ${g0.dpi} dpi)`
);
console.log(`  quality        : darkness ^MD${g0.darkness}, speed ^PR${g0.speed}, copies ^PQ${g0.copies}`);
console.log(`  symbology      : ^${g0.symbology || "BC"} (Code 128)`);
console.log(`\n  Point a Zebra hot folder at the output folder to print unattended.`);