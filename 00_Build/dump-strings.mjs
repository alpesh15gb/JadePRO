import fs from 'fs';
const f = process.argv[2];
const minLen = Number(process.argv[3] || 3);
const b = fs.readFileSync(f);
const out = [];
let cur = [], start = 0;
for (let i = 0; i < b.length; i++) {
  const c = b[i];
  if (c >= 32 && c < 127) { if (cur.length === 0) start = i; cur.push(c); }
  else { if (cur.length >= minLen) out.push({ off: start, s: Buffer.from(cur).toString('latin1') }); cur = []; }
}
if (cur.length >= minLen) out.push({ off: start, s: Buffer.from(cur).toString('latin1') });
for (const o of out) console.log(o.off + '\t' + o.s);
