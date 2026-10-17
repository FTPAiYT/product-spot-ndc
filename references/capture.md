# Capture

`npm run capture` runs `capture/plan.mjs` against the running app. The plan is code you write for this film, using the
helpers in `capture/lib.mjs`:

```js
const s = await session({ url: project.appUrl, dpr: 2 });
await s.freeze();                                     // no CSS animation, transitions or caret in captures
await s.page.click('text=Open demo');                 // get the app into the state the beat needs
await s.shot('app', 'viewport');                      // whole app
await s.shot('sidebar', '#sidebar', { transparent: true, clear: ['.layout'] });   // a piece that moves on its own
await s.shot('app-no-card', 'viewport', { hide: ['.card.hero'] });                 // the app WITHOUT the piece that lifts
await s.states('toggle', '.toggle', [
  { label: 'off', run: async () => {} },
  { label: 'on', run: (p) => p.click('.toggle') },
]);
await s.animation('drawer', '.drawer', (p) => p.click('.open-drawer'), 20);         // the app's own motion, frame by frame
await s.close();                                       // writes assets/captured/manifest.json
```

The manifest records each capture's file and rectangle in film units (CSS pixels of a 1920x1080 viewport). In the
scene, `ax(x)` / `ay(y)` turn those into world positions, so a piece placed at its rect sits exactly where it was in the
app (the camera at `FIT_Z` sees the whole viewport 1:1).

## What to capture

- **The whole app** at 2x, in the state each beat opens on.
- **Every piece that moves on its own**, transparent, with a little `pad` if it will cast a shadow or glow.
- **The container without that piece** (`hide`, which keeps layout): when a piece lifts off, the container must lose it
  on the same frame, or a copy stays behind and the lift reads as a duplicate.
- **State changes as sequences** (`states`): before/after, hover/press, a value at several positions.
- **The app's own animations** (`animation`) when you want them replayed exactly.
- **Rectangles of click targets** (`s.rect(selector)`), so the cursor lands on the real control.

## Rules

- **Capture at the zoom of the tightest shot.** `dpr` must cover how far the camera pushes in: a 165 px card filling
  600 px of a 1080p frame is a 3.6x zoom and needs `dpr: 4` (8 for a 4K master), or its text goes soft. Small pieces
  can get their own session at a higher dpr than the whole-app shot.
- Use the app's real data paths. If a state is hard to reach, add demo content or a small dev-only hook to a copy of
  the app (`window.__demo.setX(...)`), never fake the pixels.
- Zero rotations and transforms on an element before capturing it; re-apply them in the scene.
- Keep selection rings, hover states and toasts off anything you capture (activate something else first, `hide`).
- Hide with `visibility: hidden` (layout kept), not `display: none` (everything reflows).
- An overlay above something in the DOM (an icon on a card) needs its own capture and its own plane above it.
- Demo-only content goes in its own project/workspace in the app; hiding real content with CSS leaves counters and
  labels wrong on camera.
- Re-run the capture any time the app changes; the film reads the manifest, so nothing else needs editing.
