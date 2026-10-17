// The film as a contact sheet: one tile every STEP seconds, stamped with the time
// and the caption on screen. Use it to judge pacing and to show a stretch at a glance.
//   node render/sheet.mjs [--step 0.5] [--from 0] [--to end] [--cols 6] [--out renders/sheet.png]
//   node render/sheet.mjs --crop 1500,200,420,820     zoom every tile on one region (x,y,w,h of the 1920x1080 frame)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { openFilm } from './film-page.mjs';

const a = {}; const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
const step = Number(a.step ?? 0.5), cols = Number(a.cols ?? 6), out = a.out ?? 'renders/sheet.png';
const crop = a.crop ? a.crop.split(',').map(Number) : null;
const { browser, page, info, shot } = await openFilm({ scale: crop ? 1 : 0.25 });
const from = Number(a.from ?? 0), to = Number(a.to ?? info.duration);
const dir = 'renders/sheet-tiles';
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
let n = 0;
for (let t = from; t < to - 1e-6; t += step) {
  const png = await shot(t, crop ? { clip: { x: crop[0], y: crop[1], width: crop[2], height: crop[3] } } : {});
  const cap = await page.evaluate(() => [...document.querySelectorAll('.copy')].filter((e) => Number(e.style.opacity) > 0.5).map((e) => e.textContent.replace(/\s+/g, ' ')).join(' / '));
  const id = String(n).padStart(3, '0');
  fs.writeFileSync(`${dir}/${id}.png`, png);
  fs.writeFileSync(`${dir}/${id}.txt`, `${t.toFixed(2)}s ${cap ? '- ' + cap.slice(0, 44) : ''}`.replace(/[:'\\%]/g, ''));
  n++;
}
await browser.close();
const tileW = crop ? 300 : 480;
// ffmpeg's text filter needs a font file on Windows/macOS; use the first one found
const FONT = ['C:/Windows/Fonts/arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find((f) => fs.existsSync(f));
const fontArg = FONT ? `:fontfile='${FONT.replace(/^([A-Za-z]):/, '$1\\:')}'` : '';   // C: -> C\: inside a filter
for (let i = 0; i < n; i++) {
  const id = String(i).padStart(3, '0');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', `${dir}/${id}.png`, '-vf', `scale=${tileW}:-2,drawbox=y=0:w=iw:h=22:color=black@0.7:t=fill,drawtext=textfile=${dir}/${id}.txt:x=6:y=4:fontsize=14:fontcolor=white${fontArg}`, `${dir}/s${id}.png`]);
}
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', '1', '-i', `${dir}/s%03d.png`, '-vf', `tile=${cols}x${Math.ceil(n / cols)}:padding=4:color=black`, '-frames:v', '1', out]);
console.log(out, `${n} tiles`);
