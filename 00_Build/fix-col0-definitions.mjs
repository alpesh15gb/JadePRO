// fix-col0-definitions.mjs  -  bracket the remaining column-0 definitions
// -----------------------------------------------------------------------------
// WHY
//   The first bracketing pass handled Function/Variable/Collection/Style/
//   Screen/Alter/Report/Barcode but deliberately excluded Print, Part, Export
//   and Keys, assuming they were attributes of the definition above them.
//
//   Inspecting 01_Main.tdl disproved that. Line 206 is the indented attribute
//   `Print: JpAboutPrint` inside [Report: JpAboutReport]; line 208 starts a
//   SECOND, separate block of the same name whose body contains
//   `Lines: 1, 1, 1, ...` - a part/print layout, which a Report does not have.
//   So each of these column-0 lines opens its own definition, and being at
//   column 0 after an indented block it is parsed as a top-level statement with
//   no definition - the same fault that produced T0027 at line 66.
//
//   `End:` is not a TDL definition type or a documented attribute; bracketed
//   definitions are self-delimiting, so those lines are removed outright.
//
// SCOPE
//   Only COLUMN-0 lines are touched. Indented `Print:` / `Part:` / `Export:`
//   attributes inside a Report are left exactly as they are.
//
// usage: node fix-col0-definitions.mjs <tdl-dir>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node fix-col0-definitions.mjs <tdl-dir>");
  process.exit(2);
}

const BRACKET = ["Print", "Part", "Export", "Keys"];
const stats = {};
let bracketed = 0, endsRemoved = 0, files = 0;

for (const f of readdirSync(dir).filter((x) => x.endsWith(".tdl")).sort()) {
  const p = join(dir, f);
  const lines = readFileSync(p, "utf8").split(/\r?\n/);
  const out = [];
  let touched = false;

  for (const line of lines) {
    const t = line.trim();
    const atCol0 = line.length > 0 && !/^\s/.test(line);

    if (atCol0 && t.startsWith("End:")) {
      endsRemoved++; touched = true;
      continue;
    }
    if (atCol0 && !t.startsWith("[") && !t.startsWith(";")) {
      const head = /^([A-Za-z][A-Za-z0-9]*):/.exec(t);
      if (head && BRACKET.includes(head[1])) {
        stats[head[1]] = (stats[head[1]] || 0) + 1;
        bracketed++; touched = true;
        out.push("[" + line + "]");
        continue;
      }
    }
    out.push(line);
  }
  if (touched) { writeFileSync(p, out.join("\n"), "utf8"); files++; }
}

console.log("column-0 definitions bracketed :", bracketed, "in", files, "file(s)");
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log("   " + k.padEnd(8), v);
}
console.log("'End:' terminator lines removed:", endsRemoved);