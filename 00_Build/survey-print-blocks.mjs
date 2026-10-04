// survey-print-blocks.mjs
// What attributes actually appear inside [Print:] / [Export:] / [Screen:]?
// Determines whether each rewrite is a mechanical transform or real work.
import fs from 'node:fs';

const L = fs.readFileSync('JadePro.tdl', 'utf8').split(/\r?\n/);
const KINDS = ['Print', 'Export', 'Screen'];

for (const kind of KINDS) {
  const counts = new Map();
  let blocks = 0;
  for (let i = 0; i < L.length; i++) {
    const h = new RegExp(`^\\[${kind}:`).exec(L[i]);
    if (!h) continue;
    blocks++;
    const name = L[i].slice(kind.length + 2, -1).trim();
    let j = i + 1;
    for (; j < L.length; j++) {
      const s = L[j];
      if (/^\[/.test(s)) break;                 // next definition ends this one
      const m = /^    ([A-Za-z][A-Za-z0-9 _-]*?)\s*:/.exec(s);
      if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
    i = j - 1;
  }
  console.log(`\n=== [${kind}:] ${blocks} block(s) ===`);
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
}