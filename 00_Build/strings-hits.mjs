import fs from 'fs';
const files = process.argv.slice(2);
const words = ['Collection','Border','Import Object','Import File','Alter','Report','Screen','Menu','Field','Part','Button','Table','Object','Variable','Style','Color','Key','System','Definition','Function','Line','Form','Barcode','Keys','Print','Export','Set as'];
for (const f of files) {
  let b;
  try { b = fs.readFileSync(f); } catch { continue; }
  const ascii = b.toString('latin1');
  const u16 = Buffer.from(b).swap16().toString('latin1');
  const found = {};
  for (const w of words) {
    const a = ascii.split(w).length - 1;
    const u = u16.split(w).length - 1;
    if (a || u) found[w] = { ascii: a, utf16: u };
  }
  console.log('---', f, Object.keys(found).length, 'hits');
  console.log(JSON.stringify(found));
}
