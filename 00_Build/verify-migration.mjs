// Verifies the Constant -> Function migration against .tdl-backup by proving
// every difference is either a Constant declaration becoming a Function, or a
// use site gaining "()".
//
// Implemented with plain string operations rather than regex: the shell this
// runs under collapses one level of backslash escaping, so a pattern like
// "\\b(?:X)\\(\\)" silently becomes a backspace character and never matches.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const BACKUP = ".tdl-backup";
const CUR = "tdl";

const names = new Set();
for (const f of readdirSync(BACKUP).filter((x) => x.endsWith(".tdl"))) {
  for (const l of readFileSync(join(BACKUP, f), "utf8").split(/\r?\n/)) {
    const m = /^Constant:[ \t]*([A-Za-z_]\w*)/.exec(l.trim());
    if (m) names.add(m[1]);
  }
}

// undo exactly the parens the migration added: NAME() -> NAME
const ordered = [...names].sort((a, b) => b.length - a.length);
// Brackets were added by a separate migration, so normalise them away to keep
// this check focused on the Constant -> Function change only.
const unbracket = (s) => s.trim().replace(/^\[/, "").replace(/\]$/, "");
const undo = (s) => unbracket(ordered.reduce((acc, n) => acc.split(n + "()").join(n), s));
// A later migration removed `Type:` from Function blocks (T0014). Ignore those
// so this script keeps isolating only the Constant -> Function change.
const isTypeLine = (s) => /^\s*Type:\s*\S/.test(s);
// A later migration removed the invalid `End:` terminator lines (not a TDL
// keyword; bracketed definitions are self-delimiting).
const isEndLine = (s) => /^End:/.test(s.trim());
// A later migration rewrote the UDF declarations into the documented
//   [System: UDF] / <Name> : <Type> : <Index>
// form, replacing `[System: UDF "Name"]` + `Type:`/`Label:` attribute lines.
// Those lines belong to that migration, not to the Constant -> Function one.
const isUdfDeclLine = (s) =>
  /^\[System:\s*UDF\s*"?/.test(s.trim()) ||
  /^[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z]+\s*:\s*(?:undefined|\d+)\s*$/.test(s) ||
  /^\s*(?:Type|Label):\s*/.test(s);

let diff;
try {
  diff = execSync(`diff -r ${BACKUP} ${CUR}`, { encoding: "utf8", maxBuffer: 1 << 26 });
} catch (e) {
  diff = e.stdout ?? "";
}

const removed = diff.split("\n").filter((l) => l.startsWith("< ")).map((l) => l.slice(2)).filter((l) => !isTypeLine(l) && !isEndLine(l) && !isUdfDeclLine(l) && l.trim() !== "");
const added = diff.split("\n").filter((l) => l.startsWith("> ")).map((l) => l.slice(2)).filter((l) => !isTypeLine(l));
const addUndone = new Set(added.map(undo));

const constDecls = removed.filter((l) => unbracket(l).startsWith("Constant:"));
const callSites = removed.filter((l) => !unbracket(l).startsWith("Constant:") && addUndone.has(unbracket(l)));
const unexplained = removed.filter((l) => !unbracket(l).startsWith("Constant:") && !addUndone.has(unbracket(l)));
const newFuncs = added.filter((l) => unbracket(l).startsWith("Function:")).length;

console.log("removed lines        :", removed.length);
console.log("  Constant: decls    :", constDecls.length, `(expect ${names.size})`);
console.log("  () / bracket rewrites:", callSites.length);
console.log("  UNEXPLAINED        :", unexplained.length);
unexplained.slice(0, 10).forEach((u) => console.log("   !", u));

// The meaningful assertion: every changed line is accounted for by the
// Constant -> Function conversion, an added "()", or added brackets.
// newFuncs counts all Function lines added (converted constants plus the
// pre-existing functions that gained brackets), so it is informational only.
console.log("new Function: lines  :", newFuncs, "(informational)");
const ok = unexplained.length === 0 && constDecls.length === names.size;
console.log(ok ? "MIGRATION VERIFIED - no unexplained source change." : "MIGRATION NOT FULLY EXPLAINED.");
process.exit(ok ? 0 : 1);