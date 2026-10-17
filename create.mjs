#!/usr/bin/env node
// Start a new product film project from the template.
//   node create.mjs <folder> [--name "Product"] [--url http://localhost:3000/] [--site product.com] [--no-install]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').match(/^--(name|url|site)$/));
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
if (!dir) { console.log('usage: node create.mjs <folder> [--name "Product"] [--url http://localhost:3000/] [--site product.com]'); process.exit(1); }
const dest = path.resolve(dir);
if (fs.existsSync(dest) && fs.readdirSync(dest).length) { console.error(`${dest} is not empty`); process.exit(1); }

const tpl = path.join(path.dirname(fileURLToPath(import.meta.url)), 'template');
fs.cpSync(tpl, dest, { recursive: true, filter: (s) => !/node_modules|[\\/]renders[\\/]?/.test(s.slice(tpl.length)) });
fs.renameSync(path.join(dest, 'gitignore'), path.join(dest, '.gitignore'));   // npm strips dotfiles named .gitignore from packages
for (const d of ['assets/captured', 'assets/review', 'assets/music', 'assets/refs', 'renders']) fs.mkdirSync(path.join(dest, d), { recursive: true });

const pj = path.join(dest, 'project.json'), p = JSON.parse(fs.readFileSync(pj, 'utf8'));
if (opt('name')) p.name = opt('name');
if (opt('url')) p.appUrl = opt('url');
if (opt('site')) p.site = opt('site');
fs.writeFileSync(pj, JSON.stringify(p, null, 2) + '\n');
// the starter's end card shows the product's name and site
const fj = path.join(dest, 'scene', 'film.js'), q = (s) => s.replace(/[\\']/g, '\\$&');
fs.writeFileSync(fj, fs.readFileSync(fj, 'utf8').replace("text: 'Product'", `text: '${q(p.name)}'`).replace("text: 'yourproduct.com'", `text: '${q(p.site)}'`));
const pkg = path.join(dest, 'package.json'), k = JSON.parse(fs.readFileSync(pkg, 'utf8'));
k.name = (p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-spot';
fs.writeFileSync(pkg, JSON.stringify(k, null, 2) + '\n');

console.log(`created ${dest}`);
if (!args.includes('--no-install')) {
  execSync('npm install', { cwd: dest, stdio: 'inherit' });
  // newer npm blocks install scripts by default, and ffmpeg-static fetches its binary in one
  const ff = path.join(dest, 'node_modules', 'ffmpeg-static');
  if (!fs.existsSync(path.join(ff, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))) execSync('node install.js', { cwd: ff, stdio: 'inherit' });
  execSync('npx playwright install chromium', { cwd: dest, stdio: 'inherit' });
}
console.log(`\nnext:\n  cd ${dir}\n  npm run scene      (the film, live, with the review tools)\n  npm run capture    (with the app running at ${p.appUrl})`);
