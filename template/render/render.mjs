// Render the film frame by frame into a video (or stills).
//   node render/render.mjs                                   1080p30 preview with motion blur -> renders/preview.mp4
//   node render/render.mjs --out renders/final-4k.mp4 --scale 2 --crf 16      4K master
//   node render/render.mjs --audio track.wav                                  with a soundtrack (optional)
//   node render/render.mjs --stills 2.5,8,14                                  PNG stills at those seconds -> renders/stills
//   node render/render.mjs --start 10 --end 14                               only a stretch (seconds)
// Options: --fps 30|60, --blur 16 (sub-frames; 0 = off), --shutter 180 (degrees), --preset fast|medium|slow
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { openFilm } from './film-page.mjs';

const a = {}; const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) a[argv[i].slice(2)] = 'true'; else { a[argv[i].slice(2)] = n; i++; } }
const scale = Number(a.scale ?? 1), fps = Number(a.fps ?? 30), crf = Number(a.crf ?? 18);
const out = a.out ?? 'renders/preview.mp4';
const blurSamples = Number(a.blur ?? 16), shutterDeg = Number(a.shutter ?? 180);

const t0 = Date.now();
const { browser, page, info, shot } = await openFilm({ scale });
if (blurSamples > 1 && !a.stills) await page.evaluate((b) => window.__film.setBlur(b), { samples: blurSamples, shutter: shutterDeg / 360 / fps });
console.log(`film ${info.duration.toFixed(2)}s · render ${fps} fps · scale ${scale} · blur ${blurSamples > 1 ? blurSamples : 'off'}`);

if (a.stills) {
  fs.mkdirSync('renders/stills', { recursive: true });
  for (const s of a.stills.split(',').map(Number)) {
    const p = `renders/stills/t${s.toFixed(2)}.png`;
    fs.writeFileSync(p, await shot(s));
    console.log('wrote', p);
  }
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const f0 = Math.round(Number(a.start ?? 0) * fps), f1 = Math.round(Number(a.end ?? info.duration) * fps);
  const ff = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
  if (a.audio) ff.push('-ss', String(f0 / fps), '-i', a.audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest');
  ff.push('-c:v', 'libx264', '-preset', a.preset ?? 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
  const proc = spawn(ffmpegPath, ff, { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = (buf) => new Promise((res) => (proc.stdin.write(buf) ? res() : proc.stdin.once('drain', res)));
  for (let f = f0; f < f1; f++) {
    await write(await shot(f / fps));
    if ((f - f0) % (fps * 2) === 0) console.log(`frame ${f - f0}/${f1 - f0}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  proc.stdin.end();
  await new Promise((res) => proc.on('close', res));
  console.log('wrote', out, 'in', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
await browser.close();
