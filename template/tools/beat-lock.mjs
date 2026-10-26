// Put the film's hits on the music. A click that lands 40 ms off the beat reads as "the
// edit is a bit off" even when nobody can say why. This lists every hit's distance from
// its target and, with --apply, moves the timing row behind each one onto it (saved to
// assets/review/timing.json, like the Timing panel). Rows chained after a moved row move
// with it, so lead-ins (the cursor arriving before its click) stay intact.
//
// Two grids:
//   score (default)  the film's own MUSIC anchors: bars of equal length between from and to
//   --beats <file>   a real track: the .beats.json written by tools/read-track.py
//
//   node tools/beat-lock.mjs [--grid 4|8] [--max 0.25] [--apply]                       score
//   node tools/beat-lock.mjs --beats assets/music/track.beats.json [--on accents|beats|eighths]
//                            [--pin key=12.34 ...] [--max 0.6] [--apply]               track
//
// --on      what a hit snaps to with a track: accents (default; the pair of beats that hits
//           harder in this track, where a listener hears "the beat"), any beat, or eighths
// --pin     put a row at an exact time first: a story moment on a section change, or a
//           click the person placed by ear. Pinned rows are never moved afterwards.
// hits with a `group` (e.g. three cards snapping) land on consecutive eighths from the
// first one's nearest eighth, so a ripple never collapses onto one beat.
// Needs the scene server running. With the score grid the two MUSIC anchors are never moved.
import fs from 'node:fs';
import { openFilm } from '../render/film-page.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BEATS = arg('beats'), APPLY = process.argv.includes('--apply');
const ON = arg('on', 'accents'), GRID = Number(arg('grid', 8)), MAX = Number(arg('max', BEATS ? 0.6 : 0.25));
const PINS = Object.fromEntries(process.argv.flatMap((a, i) => (a === '--pin' ? [process.argv[i + 1].split('=')] : [])).map(([k, v]) => [k, Number(v)]));

const f = await openFilm({ scale: 0.25 });
const film = await f.page.evaluate(() => ({ timing: __film.timing, at: __film.at, hits: __film.hits, music: __film.music }));
await f.browser.close();

const resolve = (tbl) => {
  const out = {};
  const get = (k) => (k in out ? out[k] : (out[k] = typeof tbl[k] === 'number' ? tbl[k] : get(tbl[k].after) + tbl[k].by));
  for (const k of Object.keys(tbl)) get(k);
  return out;
};
const ancestors = (tbl, k, acc = new Set()) => { const v = tbl[k]; if (v && typeof v === 'object') { acc.add(v.after); ancestors(tbl, v.after, acc); } return acc; };
const nearest = (grid, t) => grid.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));

// ---- the grid
let targets, eighths, label, locked = new Set();
if (BEATS) {
  const tr = JSON.parse(fs.readFileSync(BEATS, 'utf8'));
  eighths = tr.beats.flatMap((b, i) => (i + 1 < tr.beats.length ? [b, (b + tr.beats[i + 1]) / 2] : [b]));
  targets = ON === 'beats' ? tr.beats : ON === 'eighths' ? eighths : tr.strong;
  const d0 = tr.beats.indexOf(tr.downbeats[0]);
  label = (t) => { const bi = tr.beats.findLastIndex((b) => b <= t + 1e-3); return `beat ${((((bi - d0) % 4) + 4) % 4) + 1}${Math.abs(t - tr.beats[bi]) > 0.01 ? '.5' : ''}`; };
  console.log(`track: ${tr.bpm} BPM, snapping to ${ON}${Object.keys(PINS).length ? `, pins: ${Object.entries(PINS).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}`);
} else {
  const m = film.music;
  if (!m) throw new Error('the film has no MUSIC anchors (film.js); for a real track pass --beats');
  const BAR = (m.to - m.from) / m.bars, STEP = BAR / GRID, T0 = m.from - Math.ceil(m.from / BAR) * BAR;
  const n = Math.ceil((film.at.end ?? m.to + 10) / STEP) + 2;
  targets = Array.from({ length: n }, (_, i) => T0 + i * STEP);
  eighths = Array.from({ length: Math.ceil(n * 8 / GRID) }, (_, i) => T0 + i * BAR / 8);
  label = (t) => `beat ${(((t - T0) / BAR) % 1 * 4 + 1).toFixed(1)}`;
  const anchors = Object.keys(film.at).filter((k) => film.at[k] === m.from || film.at[k] === m.to);
  locked = new Set(anchors.flatMap((k) => [k, ...ancestors(film.timing, k)]));
  console.log(`grid: ${(240 / BAR).toFixed(1)} BPM, 1/${GRID} = ${(STEP * 1000).toFixed(0)} ms`);
}

// ---- move a row so it resolves to time t (numbers shift; chained rows change their offset)
const T = structuredClone(film.timing), changes = {};
const setRow = (k, t) => {
  const d = t - resolve(T)[k], v = T[k];
  T[k] = typeof v === 'number' ? +(v + d).toFixed(4) : { after: v.after, by: +(v.by + d).toFixed(4) };
  changes[k] = T[k];
};
for (const [k, t] of Object.entries(PINS)) {
  if (!(k in T)) throw new Error(`--pin ${k}: no such timing row`);
  setRow(k, t); locked.add(k); console.log(`pin      ${k.padEnd(14)} → ${t.toFixed(3)}s`);
}

// ---- hits, in time order (an earlier move can carry later rows along)
const groups = {};
const hits = [...film.hits].sort((a, b) => (a.key ? resolve(T)[a.key] : a.t) - (b.key ? resolve(T)[b.key] : b.t));
for (const h of hits) {
  const t = h.key ? resolve(T)[h.key] : h.t;
  let g;
  if (h.group) {   // a ripple: the first lands on its nearest eighth, each next one an eighth later
    groups[h.group] = h.group in groups ? groups[h.group] + 1 : eighths.indexOf(nearest(eighths, t));
    g = eighths[groups[h.group]];
  } else g = nearest(targets, t);
  const d = g - t;
  let note = '';
  if (Math.abs(d) < 0.004) note = 'on target';
  else if (!h.key) note = 'no key: move it in film.js';
  else if (locked.has(h.key)) note = PINS[h.key] !== undefined ? 'pinned' : 'drives the tempo: left alone';
  else if (Math.abs(d) > MAX) note = `more than ${MAX}s away: left alone`;
  else { setRow(h.key, g); note = APPLY ? 'moved' : 'would move'; }   // moved in memory either way, so later hits read true
  console.log(`${h.kind.padEnd(8)} ${(h.key ?? '-').padEnd(14)} ${t.toFixed(3)}s  ${d >= 0 ? '+' : ''}${(d * 1000).toFixed(0).padStart(4)} ms → ${label(g)}${h.group ? ` (${h.group})` : ''}  ${note}`);
}
if (!APPLY && Object.keys(changes).length) console.log('(a preview: add --apply to save)');
if (APPLY && Object.keys(changes).length) {
  const file = 'assets/review/timing.json';
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.mkdirSync('assets/review', { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...saved, ...changes }, null, 2));
  console.log(`saved ${Object.keys(changes).length} rows to ${file}; reload the scene to see them`);
}
