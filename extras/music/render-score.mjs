// Render the code-written score against the film's CURRENT timing (saved Timing panel
// values included) and master it. Needs the scene server running (npm run scene).
//   npm run score -- [--key 0] [--name score]
//   → assets/music/<name>.wav (raw) + assets/music/<name>-master.wav (-14 LUFS)
import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { openFilm } from '../render/film-page.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const NAME = arg('name', 'score'), KEY = Number(arg('key', 0));

// 1. read the timing from the film itself (resolved seconds, hits, the two anchors)
const f = await openFilm({ scale: 0.25 });
const info = await f.page.evaluate(() => ({ duration: __film.duration, music: __film.music, hits: __film.hits, beats: __film.beats }));
await f.browser.close();

// 2. render in a blank page (rendering inside the film page can crash it: two big GPU/audio loads in one tab)
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
await p.setContent('<!doctype html><title>score</title>');
await p.addScriptTag({ path: 'music/synth.js' });
await p.addScriptTag({ path: 'music/score.js' });
const t0 = Date.now();
const r = await p.evaluate(async ([info, opts]) => {
  const buf = await window.__score.render(info, opts);
  const { b64, peak } = window.Synth.toWavB64(buf);
  return { b64, peak, seconds: buf.duration };
}, [info, { key: KEY }]);
await b.close();
fs.mkdirSync('assets/music', { recursive: true });
fs.writeFileSync(`assets/music/${NAME}.wav`, Buffer.from(r.b64, 'base64'));
const m = info.music;
if (m) console.log(`grid: ${(240 / ((m.to - m.from) / m.bars)).toFixed(1)} BPM, downbeats at ${m.from.toFixed(2)}s and ${m.to.toFixed(2)}s`);
console.log(`${NAME}: ${r.seconds.toFixed(2)}s rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 3. master: ONE fixed gain to -14 LUFS integrated, then a peak limiter. (Single-pass
// loudnorm rides the level and flattens the dynamics: a quiet intro comes out as loud
// as the drop.)
const measure = (file) => Number(/I:\s+(-?[\d.]+) LUFS/.exec(spawnSync(ffmpeg, ['-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' }).stderr)?.[1]);
const raw = measure(`assets/music/${NAME}.wav`), gain = -14 - raw;
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', `assets/music/${NAME}.wav`, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:attack=2:release=60:level=disabled`, '-ar', '48000', `assets/music/${NAME}-master.wav`]);
console.log(`assets/music/${NAME}-master.wav  (${raw} LUFS raw, ${gain.toFixed(1)} dB → ${measure(`assets/music/${NAME}-master.wav`)} LUFS)`);
