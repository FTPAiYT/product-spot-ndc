// Open the scene headlessly, ready to seek. Shared by every render tool.
import { chromium } from 'playwright';

export const SCENE_URL = process.env.SCENE_URL ?? 'http://127.0.0.1:5174/';
export async function openFilm({ scale = 1, url = SCENE_URL, render = true } = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300)); });
  try { await page.goto(url, { waitUntil: 'networkidle' }); } catch (e) { console.error(`can't open ${url}: is the scene server running? (npm run scene)`); throw e; }
  await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__film.ready);
  if (render) await page.evaluate(() => window.__film.renderMode());
  const info = await page.evaluate(() => ({ fps: window.__film.fps, frames: window.__film.frames, duration: window.__film.duration, beats: window.__film.beats }));
  const seek = (t) => page.evaluate((t) => window.__film.seekTime(t), t);
  const shot = async (t, opts = {}) => { await seek(t); return page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', ...opts }); };
  return { browser, page, info, seek, shot };
}
