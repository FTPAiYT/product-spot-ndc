#!/usr/bin/env node
// OPTIONAL: add a code-written score to an existing film project. Only when the person
// asks for original music; most films use a licensed track or none (references/music.md).
//   node add-music.mjs <project folder>
// Adds music/ (synth, starter score, renderer) and the "score" npm script.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'scene', 'film.js'))) { console.log('usage: node add-music.mjs <project folder>   (a folder made by create.mjs)'); process.exit(1); }
const dest = path.join(path.resolve(dir), 'music');
if (fs.existsSync(dest)) { console.error(`${dest} already exists`); process.exit(1); }
fs.cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'extras', 'music'), dest, { recursive: true });
const pkg = path.join(dir, 'package.json'), k = JSON.parse(fs.readFileSync(pkg, 'utf8'));
k.scripts.score = 'node music/render-score.mjs';
fs.writeFileSync(pkg, JSON.stringify(k, null, 2) + '\n');
console.log(`added ${dest}\n  npm run score        (scene server running) → assets/music/score-master.wav\n  npm run render -- --audio assets/music/score-master.wav`);
