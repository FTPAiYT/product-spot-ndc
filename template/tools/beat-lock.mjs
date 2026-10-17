// Put the film's hits on the music grid. A click that lands 40 ms off the beat reads
// as "the edit is a bit off" even when nobody can say why. This lists every hit's
// distance from the nearest beat (or eighth) and, with --apply, moves the timing row
// behind each one onto it (saved to assets/review/timing.json, like the Timing panel).
//   node tools/beat-lock.mjs [--grid 4|8] [--max 0.25] [--apply]
// Needs the scene server running. The two MUSIC anchors are never moved.
import fs from 'node:fs';
import { openFilm } from '../render/film-page.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const GRID = Number(arg('grid', 8)), MAX = Number(arg('max', 0.25)), APPLY = process.argv.includes('--apply');

const f = await openFilm({ scale: 0.25 });
const film = await f.page.evaluate(() => ({ timing: __film.timing, at: __film.at, hits: __film.hits, music: __film.music }));
await f.browser.close();
const m = film.music;
if (!m) throw new Error('the film has no MUSIC anchors (film.js)');
const BAR = (m.to - m.from) / m.bars, STEP = BAR / GRID;
const T0 = m.from - Math.ceil(m.from / BAR) * BAR;
console.log(`grid: ${(240 / BAR).toFixed(1)} BPM, 1/${GRID} = ${(STEP * 1000).toFixed(0)} ms`);

const resolve = (tbl) => {
  const out = {};
  const get = (k) => (k in out ? out[k] : (out[k] = typeof tbl[k] === 'number' ? tbl[k] : get(tbl[k].after) + tbl[k].by));
  for (const k of Object.keys(tbl)) get(k);
  return out;
};
const ancestors = (tbl, k, acc = new Set()) => { const v = tbl[k]; if (v && typeof v === 'object') { acc.add(v.after); ancestors(tbl, v.after, acc); } return acc; };
const anchors = Object.keys(film.at).filter((k) => film.at[k] === m.from || film.at[k] === m.to);
const locked = new Set(anchors.flatMap((k) => [k, ...ancestors(film.timing, k)]));

const T = structuredClone(film.timing), changes = {};
for (const h of film.hits) {
  const at = resolve(T), t = h.key ? at[h.key] : h.t;
  const g = T0 + Math.round((t - T0) / STEP) * STEP, d = g - t;
  const beat = ((g - T0) / BAR) % 1 * 4 + 1;
  let note = '';
  if (Math.abs(d) < 0.004) note = 'on the grid';
  else if (!h.key) note = 'no key: move it in film.js';
  else if (locked.has(h.key)) note = 'drives the tempo: left alone';
  else if (Math.abs(d) > MAX) note = `more than ${MAX}s away: left alone`;
  else if (APPLY) {
    const v = T[h.key];
    T[h.key] = typeof v === 'number' ? +(v + d).toFixed(4) : { after: v.after, by: +(v.by + d).toFixed(4) };
    changes[h.key] = T[h.key]; note = 'moved';
  } else note = 'would move';
  console.log(`${h.kind.padEnd(8)} ${(h.key ?? '-').padEnd(14)} ${t.toFixed(3)}s  ${d >= 0 ? '+' : ''}${(d * 1000).toFixed(0).padStart(4)} ms → beat ${beat.toFixed(1)}  ${note}`);
}
if (APPLY && Object.keys(changes).length) {
  const file = 'assets/review/timing.json';
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.mkdirSync('assets/review', { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...saved, ...changes }, null, 2));
  console.log(`saved ${Object.keys(changes).length} rows to ${file}; reload the scene to see them`);
}
