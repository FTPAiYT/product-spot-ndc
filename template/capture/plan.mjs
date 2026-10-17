// The capture plan: what to grab from the app for THIS film. The starter grabs the
// whole app, one feature element, and the app without that element (so the film can
// lift the feature off without leaving a copy behind). Settings: project.json "capture".
// Grow it as the storyboard grows: one shot per piece that moves on its own, a state
// sequence per thing that changes, an animation per app motion you want to replay.
// Run with the app running:  npm run capture
import fs from 'node:fs';
import { session } from './lib.mjs';

const project = JSON.parse(fs.readFileSync('project.json', 'utf8'));
const c = project.capture ?? {};
const s = await session({ url: project.appUrl, dpr: c.dpr ?? 2, colorScheme: c.colorScheme ?? 'dark' });
await s.page.waitForTimeout(c.settleMs ?? 800);
// get the app into the state the film opens on: clicks in order (close a welcome panel,
// open a project, select a view...)
for (const sel of c.setup ?? []) { await s.page.click(sel); await s.page.waitForTimeout(400); }
await s.page.evaluate(() => document.fonts.ready);
await s.freeze();

const hide = c.hide ?? [];
await s.shot('app', 'viewport', { hide });
if (c.feature) {
  // tag the first match, so hiding it hides only it (a class selector would hide every card)
  await s.page.locator(c.feature).first().evaluate((e) => e.setAttribute('data-spot-feature', ''));
  await s.shot('feature', '[data-spot-feature]', { transparent: true, clear: c.clear ?? [], pad: c.pad ?? 0 });
  await s.shot('appHole', 'viewport', { hide: [...hide, '[data-spot-feature]'] });
}
await s.close();
