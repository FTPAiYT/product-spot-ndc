// Capture helpers: drive the REAL app in a headless browser and save the pieces the
// film is built from, as images plus a manifest of where each piece sits.
// Every capture is at device-pixel-ratio `dpr` (2+ keeps text sharp when the camera
// pushes in). Rects are in CSS pixels of a 1920x1080 viewport, i.e. film units.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export async function session({ url, width = 1920, height = 1080, dpr = 2, out = 'assets/captured', colorScheme = 'dark' } = {}) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, colorScheme });
  page.on('pageerror', (e) => console.error('[app error]', e.message));
  const manifestFile = path.join(out, 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  manifest.viewport = [width, height]; manifest.dpr = dpr;
  if (url) await page.goto(url, { waitUntil: 'networkidle' });
  const log = (...a) => console.log('[capture]', ...a);

  // where an element is: [x, y, w, h]
  const rect = (sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  // stop CSS animation/transition and the caret, so every capture is a clean still
  const freeze = () => page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }' });
  // temporarily hide / style things (returns an undo)
  const style = async (css) => { const h = await page.addStyleTag({ content: css }); return () => h.evaluate((e) => e.remove()); };
  const hide = (sels) => style(`${[].concat(sels).join(',')} { visibility: hidden !important; }`);

  // shot(name, target, opts): target = 'viewport' | CSS selector | [x, y, w, h]
  //   transparent: true      element on a transparent background (for lifting it off the app);
  //                          list `clear` selectors whose backgrounds must go too (its parents)
  //   pad: 20                 extra margin around an element (room for its shadow/glow)
  //   hide: ['.toast']        hidden during this shot only
  async function shot(name, target = 'viewport', { transparent = false, clear = [], pad = 0, hide: hideSels = [], file } = {}) {
    let r = target === 'viewport' ? [0, 0, width, height] : Array.isArray(target) ? target : await rect(target);
    r = [r[0] - pad, r[1] - pad, r[2] + 2 * pad, r[3] + 2 * pad];
    const undo = [];
    if (hideSels.length) undo.push(await hide(hideSels));
    if (transparent) undo.push(await style(`html, body, ${['#app', ...clear].join(',')} { background: transparent !important; background-image: none !important; }`));
    await page.waitForTimeout(120);
    const f = file ?? `${name}.png`;
    await page.screenshot({ path: path.join(out, f), clip: { x: r[0], y: r[1], width: r[2], height: r[3] }, omitBackground: transparent });
    for (const u of undo.reverse()) await u();
    manifest[name] = { file: f, rect: r };
    log(name, r.map(Math.round).join(','), transparent ? '(transparent)' : '');
    return manifest[name];
  }
  // a state sequence: run each step, capture the same target after each (button hover/press,
  // a panel before/after a change, a value at several positions...)
  async function states(name, target, steps, opts = {}) {
    const frames = [];
    for (const [i, s] of steps.entries()) {
      await s.run(page);
      await page.waitForTimeout(s.wait ?? 150);
      frames.push((await shot(`${name}-${s.label ?? i}`, target, { ...opts, file: `${name}/${String(i).padStart(2, '0')}-${s.label ?? i}.png` })).file);
    }
    fs.mkdirSync(path.join(out, name), { recursive: true });
    manifest[name] = { frames, rect: manifest[`${name}-${steps[0].label ?? 0}`].rect };
    for (const s of steps.keys()) delete manifest[`${name}-${steps[s].label ?? s}`];
    return manifest[name];
  }
  // an app animation as frames: pause its CSS animations/transitions and step their clock
  // (the app's own motion, e.g. an accordion opening, played back frame-exact in the film)
  async function animation(name, target, trigger, n = 16, opts = {}) {
    await trigger(page);
    await page.waitForTimeout(20);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    const frames = [];
    for (let k = 0; k <= n; k++) {
      await page.evaluate((f) => { for (const a of document.getAnimations()) a.currentTime = a.effect.getTiming().duration * f; }, k / n);
      frames.push((await shot(`${name}-f`, target, { ...opts, file: `${name}/${String(k).padStart(2, '0')}.png` })).file);
    }
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    delete manifest[`${name}-f`];
    manifest[name] = { frames, rect: Array.isArray(target) ? target : await rect(target) };
    return manifest[name];
  }
  const save = () => { fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2)); log('manifest ->', manifestFile); };
  const close = async () => { save(); await browser.close(); };
  fs.mkdirSync(out, { recursive: true });
  return { browser, page, manifest, log, rect, freeze, style, hide, shot, states, animation, save, close };
}
