// THE FILM. This starter is a neutral three-beat placeholder that runs as soon as
// something is captured: the app on screen with a title, a push into one feature
// that lifts off the app, and an end card. Replace it beat by beat with the
// storyboard you agree with the person (references/method.md). Everything here is
// driven by the TIMING table, so every action stays editable in the Timing panel.
import {
  THREE, W, H, FIT_Z, ax, ay, ease, track, ramp, span, clamp01, mix,
  scene, camera, manifest, loadTex, cap, plane, basicMat, placeholderTex, makeShadow, setFocus, fx,
} from './engine.js';

// ---------------------------------------------------------------- timing
// One row per action. Numbers are seconds from the start; { after, by } rides
// along with another action; names ending in 0/1 are the start/end of one move;
// names ending in "Dur" are lengths. `end` is the film's length.
export const TIMING = {
  appIn0: 0.0, appIn1: 1.0,
  titleIn: 0.5,
  push0: 4.2, push1: 5.8,
  lift0: { after: 'push1', by: -0.3 }, lift1: { after: 'lift0', by: 1.0 },
  appOut0: { after: 'lift0', by: 0.15 }, appOut1: { after: 'appOut0', by: 0.9 },
  featureLine: { after: 'lift1', by: 0.1 },
  endCard: { after: 'lift1', by: 4.2 },
  end: { after: 'endCard', by: 4.8 },
};
export const LABELS = {
  appIn0: 'App starts fading in', appIn1: 'App fully in', titleIn: 'Title line in',
  push0: 'Camera push starts', push1: 'Camera on the feature',
  lift0: 'Feature starts lifting off', lift1: 'Feature lifted',
  appOut0: 'App starts falling back', appOut1: 'App gone',
  featureLine: 'Feature line in', endCard: 'Cut to end card', end: 'Film ends',
};
// chips in the transport, and what the Timing panel groups by
export const BEATS = [{ name: 'Open', at: 'appIn0' }, { name: 'Feature', at: 'push0' }, { name: 'End', at: 'endCard' }];
// hard cuts (the motion-blur shutter never smears across them)
export const cuts = (at) => [at.endCard];
// OPTIONAL, for a soundtrack cut to the picture (a licensed track or a score added with
// add-music.mjs): moments the music should hit (clicks, snaps, reveals, cuts, the logo).
// `key` names the timing row behind it, so tools/beat-lock.mjs can move it onto the beat.
// Hits that answer one action in turn (cards snapping one after another) share a `group`:
// they land on consecutive eighths instead of collapsing onto the same beat.
export const hits = (at) => [{ t: at.lift0, kind: 'reveal', key: 'lift0' }, { t: at.endCard, kind: 'logo', key: 'endCard' }];
// the music's tempo is set so these two moments fall exactly on downbeats: the whole number
// of bars nearest `bpm` (or give `bars` to fix the count)
export const MUSIC = { from: 'push1', to: 'endCard', bpm: 100 };

// ---------------------------------------------------------------- captions
// cls: big | mid | small | kicker | wordmark. top = px from the top of the 1920x1080 frame.
// on: [startKey, endKey] (or (at) => [t0, t1]). w = box width (lines wrap inside it).
// Every line can be moved, resized and retyped in the scrubber (E).
export const COPY = [
  { id: 'title', text: 'Your product, in one line.', cls: 'big', top: 860, on: ['titleIn', 'push0'], w: 1300 },
  { id: 'feature', text: 'The one feature that matters, named plainly.', cls: 'mid', top: 900, on: ['featureLine', 'endCard'], w: 1200 },
  { id: 'mark', text: 'Product', cls: 'wordmark', top: 470, size: 1.6, on: (at) => [at.endCard + 0.5, at.end + 0.01], fadeOut: 0 },
  { id: 'url', text: 'yourproduct.com', cls: 'small', top: 640, size: 1.4, on: (at) => [at.endCard + 1.3, at.end + 0.01], fadeOut: 0 },
];
export const FONT = 'inter';

// ---------------------------------------------------------------- build
// The capture plan (capture/plan.mjs) writes assets/captured/manifest.json:
//   app: { file, rect }        the whole app at 1920x1080 (or any frame)
//   feature: { file, rect }    one element, transparent, with its rect inside the app
const group = new THREE.Group(); scene.add(group);
let app, appTex, holeTex, feature, featureShadow, FEAT;
export async function build() {
  appTex = manifest?.app ? await loadTex(cap(manifest.app.file)) : placeholderTex('run capture: npm run capture', 1920, 1080);
  // the app WITHOUT the feature: swapped in the moment the feature lifts, so no copy stays behind
  holeTex = manifest?.appHole ? await loadTex(cap(manifest.appHole.file)) : appTex;
  app = plane(W, H, basicMat(appTex, { alphaTest: 0 }));
  group.add(app);
  // the feature: where it sits in the app (1:1), and its own transparent capture
  const r = manifest?.feature?.rect ?? [1180, 300, 560, 380];
  const fTex = manifest?.feature ? await loadTex(cap(manifest.feature.file)) : placeholderTex('feature', r[2], r[3], '#2a2a33');
  FEAT = { home: new THREE.Vector3(ax(r[0] + r[2] / 2), ay(r[1] + r[3] / 2), 1), w: r[2], h: r[3] };
  // depthWrite on: the depth of field reads the depth buffer, and a plane that doesn't write
  // depth gets the focus of whatever is behind it (it blurs while 'in focus')
  feature = plane(r[2], r[3], basicMat(fTex, { depthWrite: true }));
  feature.renderOrder = 2; feature.visible = false;
  featureShadow = makeShadow(feature, r[2] * 1.05, r[3] * 1.12, -14);
  group.add(feature);
}

// ---------------------------------------------------------------- tracks (rebuilt whenever the timing changes)
let camPos, camLook, appIn, appOut, liftK, titleDim;
export function retime(at) {
  // the push frames the feature at 45% of the width or 55% of the height, whichever is
  // tighter (projection, not guesswork): distance = size / (fraction * 2 tan(fov/2))
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fz = Math.max(FEAT.w / (0.45 * 2 * tanH * camera.aspect), FEAT.h / (0.55 * 2 * tanH));
  const up = 0.09 * 2 * fz * tanH;   // the feature sits a little above centre: the lower band is for copy
  camPos = track([
    { t: 0, v: [0, 0, FIT_Z * 1.04] },
    { t: at.push0, v: [0, 0, FIT_Z * 0.98], e: ease.linear },            // a slow drift while the app holds
    { t: at.push1, v: [FEAT.home.x, FEAT.home.y - up, fz + FEAT.home.z] },
    { t: at.endCard, v: [FEAT.home.x, FEAT.home.y - up, fz * 0.94], e: ease.linear },
  ]);
  camLook = track([
    { t: 0, v: [0, 0, 0] }, { t: at.push0, v: [0, 0, 0] },
    { t: at.push1, v: [FEAT.home.x, FEAT.home.y - up, 0] },
  ]);
  appIn = ramp(at.appIn0, at.appIn1, ease.outCubic);
  appOut = ramp(at.appOut0, at.appOut1, ease.inOutCubic);
  liftK = ramp(at.lift0, at.lift1, ease.inOutCubic);
  titleDim = span(at.titleIn, at.push0, 0.5, 0.8);   // the app dims under the title so the line reads
}

// ---------------------------------------------------------------- per frame
export function update(t, at) {
  const inEnd = t >= at.endCard;
  group.visible = !inEnd;
  const cp = camPos(t), cl = camLook(t);
  camera.position.set(cp[0], cp[1], cp[2]); camera.lookAt(cl[0], cl[1], cl[2]); camera.updateMatrixWorld();
  // the app: fades in, then darkens and falls back as the feature comes off it
  const o = appIn(t) * (1 - appOut(t));
  app.material.opacity = o; app.visible = o > 0.002;
  app.material.color.setScalar((1 - 0.5 * liftK(t)) * (1 - 0.45 * titleDim(t)));
  app.material.map = t >= at.lift0 ? holeTex : appTex;
  app.position.z = -60 * appOut(t);
  // the feature: appears exactly over its own spot, then lifts toward the camera with a shadow
  const k = liftK(t);
  feature.visible = t >= at.lift0;
  feature.position.set(FEAT.home.x, FEAT.home.y, FEAT.home.z + 160 * k);
  feature.scale.setScalar(1 + 0.04 * k);
  featureShadow.material.opacity = 0.55 * k;
  // keep whatever the camera looks at in focus
  setFocus(camera.position.distanceTo(feature.visible ? feature.position : app.position), 500, t < at.push1 ? 0 : 1.8 * k);
}
