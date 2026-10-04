// survey-ownership.mjs
// Which definition type owns each remaining `Field: <Field-Id: ...>`?
// route-line-to-field.mjs only rewrites [Line:] bodies, so anything sitting
// inside a [Screen:] (or similar) container was never in scope.
import fs from 'node:fs';

const files = fs.readdirSync('tdl').filter((f) => f.endsWith('.tdl')).sort();
const byType = new Map();
const samples = new Map();

for (const f of files) {
  const L = fs.readFileSync(`tdl/${f}`, 'utf8').split(/\r?\n/);
  let owner = '(none)';
  for (const raw of L) {
    const d = /^\[([#*!]?)([A-Za-z][A-Za-z ]*?)\s*:/.exec(raw);
    if (d) owner = d[2].trim();
    if (/^\s*Field:\s*<Field-Id:/.test(raw)) {
      byType.set(owner, (byType.get(owner) || 0) + 1);
      if (!samples.has(owner)) samples.set(owner, `${f}: ${raw.trim()}`);
    }
  }
}

let total = 0;
for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) {
  total += n;
  console.log(`${String(n).padStart(5)}  [${t}]`);
  console.log(`         ${samples.get(t)}`);
}
console.log(`total  ${total}`);