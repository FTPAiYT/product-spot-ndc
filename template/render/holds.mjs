// How long each caption is fully readable vs how long its words take to read
// (about 1 s + 0.3 s a word). Lines marked SHORT come off before people can read them.
//   node render/holds.mjs
import { openFilm } from './film-page.mjs';

const { browser, page, info } = await openFilm({ scale: 0.25 });
const r = await page.evaluate((dur) => {
  const on = {}, first = {};
  for (let t = 0; t < dur; t += 0.05) {
    window.__film.seekTime(t, true);
    for (const el of document.querySelectorAll('.copy')) if (Number(el.style.opacity) > 0.9) { on[el.dataset.id] = (on[el.dataset.id] ?? 0) + 0.05; first[el.dataset.id] ??= t; }
  }
  return [...document.querySelectorAll('.copy')].map((el) => ({ id: el.dataset.id, at: first[el.dataset.id] ?? null, held: on[el.dataset.id] ?? 0, words: el.textContent.trim().split(/\s+/).length, text: el.textContent.replace(/\s+/g, ' ').trim() }));
}, info.duration);
await browser.close();
for (const c of r) {
  const need = 1 + 0.3 * c.words;
  console.log(`${c.held + 0.05 < need ? 'SHORT' : 'ok   '}  ${c.id.padEnd(10)} at ${c.at == null ? '  -  ' : c.at.toFixed(1).padStart(5)}s  on ${c.held.toFixed(1).padStart(4)}s  needs ~${need.toFixed(1)}s  ${c.text}`);
}
