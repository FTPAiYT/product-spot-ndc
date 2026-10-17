// Dev server for the scene (port 5174). Besides the page it serves the asset folders
// straight from disk (with byte ranges, so review videos scrub) and four small
// stores the review tools write to: notes, timing, caption edits, font pick.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REVIEW = path.join(here, 'assets', 'review');
fs.mkdirSync(REVIEW, { recursive: true });
const body = async (req) => { const c = []; for await (const x of req) c.push(x); return c.length ? JSON.parse(Buffer.concat(c).toString('utf8')) : {}; };
const send = (res, obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// /__timing, /__copy, /__fonts: GET the saved JSON, POST replaces (fonts merges), DELETE resets
function store(route, file, { merge = false } = {}) {
  const f = path.join(REVIEW, file);
  return (req, res, next) => {
    if (!req.url.startsWith(route)) return next();
    if (req.method === 'GET') return send(res, readJson(f, null));
    if (req.method === 'DELETE') { fs.rmSync(f, { force: true }); return send(res, { ok: true }); }
    return body(req).then((b) => { fs.writeFileSync(f, JSON.stringify(merge ? { ...readJson(f, {}), ...b } : b, null, 2)); send(res, { ok: true }); });
  };
}
// /__notes: timestamped review notes (the agent reads assets/review/notes.json)
function notes(req, res, next) {
  if (!req.url.startsWith('/__notes')) return next();
  const f = path.join(REVIEW, 'notes.json');
  let n = readJson(f, []);
  if (req.method === 'GET') return send(res, n);
  return body(req).then((b) => {
    if (req.method === 'POST') { n.push({ id: Date.now().toString(36), t: b.t, frame: b.frame, text: b.text, at: new Date().toISOString() }); n.sort((a, c) => a.t - c.t); }
    if (req.method === 'DELETE') n = n.filter((x) => x.id !== b.id);
    fs.writeFileSync(f, JSON.stringify(n, null, 2)); send(res, n);
  });
}
const MIME = { html: 'text/html', md: 'text/markdown; charset=utf-8', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', mp4: 'video/mp4', wav: 'audio/wav', mp3: 'audio/mpeg', css: 'text/css', js: 'text/javascript', json: 'application/json' };
// the asset folders, read from disk on every request (files written after the server
// started included), with byte ranges (without them Chrome can't seek a video)
function assets(req, res, next) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!/^\/(captured|review|music|refs)\//.test(url)) return next();
  const root = path.join(here, 'assets');
  let file = path.normalize(path.join(root, url));
  if (!file.startsWith(root) || !fs.existsSync(file)) return next();
  if (fs.statSync(file).isDirectory()) { file = path.join(file, 'index.html'); if (!fs.existsSync(file)) return next(); }
  const size = fs.statSync(file).size;
  res.setHeader('content-type', MIME[path.extname(file).slice(1)] ?? 'application/octet-stream');
  res.setHeader('cache-control', 'no-cache'); res.setHeader('accept-ranges', 'bytes');
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (m) {
    const start = m[1] === '' ? size - Number(m[2]) : Number(m[1]), end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start > end || start >= size) { res.statusCode = 416; res.setHeader('content-range', `bytes */${size}`); return res.end(); }
    res.statusCode = 206; res.setHeader('content-range', `bytes ${start}-${end}/${size}`); res.setHeader('content-length', String(end - start + 1));
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader('content-length', String(size));
  fs.createReadStream(file).pipe(res);
}

export default defineConfig({
  root: path.join(here, 'scene'),
  publicDir: false,
  // captures and renders rewrite whole folders; watching them crashes Vite on Windows (EBUSY)
  server: { host: '127.0.0.1', port: 5174, strictPort: true, watch: { ignored: ['**/assets/**', '**/renders/**'] } },
  optimizeDeps: { include: ['three', 'postprocessing'] },
  plugins: [{ name: 'spot-review', configureServer(s) { s.middlewares.use(assets); s.middlewares.use(notes); s.middlewares.use(store('/__timing', 'timing.json')); s.middlewares.use(store('/__copy', 'copy.json')); s.middlewares.use(store('/__fonts', 'fonts.json', { merge: true })); } }],
});
