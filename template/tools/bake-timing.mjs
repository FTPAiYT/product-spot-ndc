// Write the Timing panel's saved values (assets/review/timing.json) into the TIMING
// table in scene/film.js, so an agreed timing pass lives in the code (and in git).
// Comments and layout are kept; only the numbers change.
//   node tools/bake-timing.mjs            then delete timing.json, or keep it: same values
import fs from 'node:fs';

const FILE = 'scene/film.js';
const raw = fs.readFileSync(FILE, 'utf8'), crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
const saved = JSON.parse(fs.readFileSync('assets/review/timing.json', 'utf8'));
const a = s.indexOf('export const TIMING = {'), b = s.indexOf('\n};', a) + 3;
if (a < 0) throw new Error(`no "export const TIMING = {" in ${FILE}`);
let blk = s.slice(a, b);
const num = (v) => String(Math.round(v * 1000) / 1000);
const changed = [];
for (const [k, v] of Object.entries(saved)) {
  const plain = new RegExp(`(\\b${k}: )-?[0-9.]+`), rel = new RegExp(`(\\b${k}: \\{ after: )'[^']*'(, by: )-?[0-9.]+`);
  const before = blk;
  if (typeof v === 'number') {
    if (plain.test(blk)) blk = blk.replace(plain, `$1${num(v)}`);
    else if (rel.test(blk)) blk = blk.replace(new RegExp(`(\\b${k}: )\\{[^}]*\\}`), `$1${num(v)}`);   // made absolute in the panel
    else { console.warn(`skip ${k}: not in TIMING`); continue; }
  } else {
    const val = `{ after: '${v.after}', by: ${num(v.by)} }`;
    if (rel.test(blk) || plain.test(blk)) blk = blk.replace(new RegExp(`(\\b${k}: )(\\{[^}]*\\}|-?[0-9.]+)`), `$1${val}`);
    else { console.warn(`skip ${k}: not in TIMING`); continue; }
  }
  if (blk !== before) changed.push(k);
}
s = s.slice(0, a) + blk + s.slice(b);
fs.writeFileSync(FILE, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log(changed.length ? `baked ${changed.length}: ${changed.join(', ')}` : 'nothing to change');
