// The film runtime. A film (scene/film.js) describes WHAT happens; this file is
// HOW it is shown: renderer + look (depth of field, bloom, grain), the timing
// table, captions, the review transport, motion blur, and the headless render
// API. The whole film is a pure function of time: window.__film.seekTime(t)
// draws the frame at t, in any order, so render/render.mjs can step through it.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, DepthOfFieldEffect, VignetteEffect, NoiseEffect, ChromaticAberrationEffect, BlendFunction,
} from 'postprocessing';
import { ease, track, ramp, span, clamp01, mix } from './tl.js';

export { THREE, ease, track, ramp, span, clamp01, mix };
export const W = 1920, H = 1080, FPS = 60, FOV = 28;

// ---------------------------------------------------------------- helpers
export const ax = (x) => x - W / 2;      // capture/CSS pixels -> world (the app plane sits 1:1 at z=0)
export const ay = (y) => H / 2 - y;
export const deg = (d) => (d * Math.PI) / 180;
const loader = new THREE.TextureLoader();
const texCache = new Map();
export function loadTex(url) {
  if (texCache.has(url)) return texCache.get(url);
  const p = new Promise((res, rej) => loader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    res(t);
  }, undefined, rej));
  texCache.set(url, p);
  return p;
}
export const cap = (file) => `/captured/${file}`;
export function plane(w, h, material) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); }
export function basicMat(tex, opts = {}) {
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, toneMapped: false, ...opts });
}
// a texture you can see before anything is captured
export function placeholderTex(label, w = 1600, h = 900, bg = '#1c1c22') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3a3a44'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#8b8b94'; g.font = `600 ${Math.round(h / 14)}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Texture-sequence material: crossfade tA->tB by mixF (state changes captured as
// frames), cover mapping, and a before/after wipe (tW shown where u > wipe).
const seqVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const seqFrag = `
  uniform sampler2D tA; uniform sampler2D tB; uniform float mixF;
  uniform sampler2D tW; uniform float wipe; uniform float lineW;
  uniform float opacity; uniform vec2 uvScale; uniform vec2 uvOffset;
  varying vec2 vUv;
  void main(){
    vec2 uv = vUv * uvScale + uvOffset;
    vec4 c = mix(texture2D(tA, uv), texture2D(tB, uv), mixF);
    if (wipe < 1.5) {
      vec4 w = texture2D(tW, uv);
      float d = vUv.x - wipe;
      c = mix(c, w, step(0.0, d));
      c.rgb = mix(c.rgb, vec3(1.0), (1.0 - smoothstep(0.0, lineW, abs(d))) * 0.92);
    }
    gl_FragColor = vec4(c.rgb, c.a * opacity);
    #include <colorspace_fragment>
  }`;
export function seqMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: tex }, tB: { value: tex }, mixF: { value: 0 }, tW: { value: tex }, wipe: { value: 2 }, lineW: { value: 0.0025 },
      opacity: { value: 1 }, uvScale: { value: new THREE.Vector2(1, 1) }, uvOffset: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: seqVert, fragmentShader: seqFrag, transparent: true, depthWrite: true,
  });
}
export function setSeq(mat, seq, idx) {
  const i0 = Math.max(0, Math.min(seq.length - 1, Math.floor(idx))), i1 = Math.min(seq.length - 1, i0 + 1);
  mat.uniforms.tA.value = seq[i0]; mat.uniforms.tB.value = seq[i1]; mat.uniforms.mixF.value = clamp01(idx - i0);
}
// soft drop shadow for anything that lifts off a surface (child of `parent`)
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.shadowColor = '#000'; g.shadowBlur = 60;
  g.beginPath(); g.roundRect(96, 96, 320, 320, 28); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export function makeShadow(parent, sx, sy, dy = -10) {
  const m = plane(sx, sy, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  m.position.set(0, dy, -2); m.renderOrder = -1; parent.add(m); return m;
}
// a cursor drawn from a path; place(p) puts its HOTSPOT on world point p. It is
// drawn in front of what it points at, so it is slid back along the camera ray:
// the tip lands on the target on screen whatever the camera is doing.
function glyphTex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.scale(256 / 24, 256 / 24); draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const arrowTex = glyphTex((g) => {
  const p = new Path2D('M5 3 L5 19 L9.2 15.4 L12 21 L14.6 19.9 L11.9 14.4 L17 14 Z');
  g.lineJoin = 'round'; g.strokeStyle = 'black'; g.lineWidth = 2.4; g.fillStyle = 'black'; g.fill(p); g.stroke(p); g.fillStyle = 'white'; g.fill(p);
});
export function makeCursor(group, size = 46) {
  const mat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthTest: false, toneMapped: false, opacity: 0 });
  const mesh = plane(size, size, mat); mesh.renderOrder = 10; group.add(mesh);
  const HOT = [5 / 24, 3 / 24], LIFT = 30;
  const place = (p, s = 1) => {
    const c = camera.position, k = (p.z + LIFT - c.z) / (p.z - c.z);
    const x = c.x + (p.x - c.x) * k, y = c.y + (p.y - c.y) * k;
    mesh.scale.setScalar(s);
    mesh.position.set(x - (HOT[0] - 0.5) * size * s, y - (0.5 - HOT[1]) * size * s, p.z + LIFT);
  };
  return { mesh, mat, place };
}
export const pressScaleAt = (t, clicks) => { let s = 1; for (const c of clicks) { const u = (t - c) / 0.16; if (u >= 0 && u <= 1) s = 1 - 0.14 * Math.sin(u * Math.PI); } return s; };

// ---------------------------------------------------------------- renderer + look
export const stage = document.getElementById('stage');
export const ui = document.getElementById('ui');
export const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
stage.prepend(renderer.domElement);
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// Thin bright lines (connectors, outlines) leave a dashed ghost in the depth-of-field
// background blur. Put them in `overlay`: it is drawn after DOF, before bloom/grain.
export const overlay = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(FOV, W / H, 10, 30000);
// at this distance the z=0 plane shows exactly W x H world units (1 unit = 1 captured pixel)
export const FIT_Z = (H / 2) / Math.tan(deg(FOV / 2));
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
composer.addPass(new RenderPass(scene, camera));
export const fx = {
  dof: new DepthOfFieldEffect(camera, { focusDistance: FIT_Z, focusRange: 300, bokehScale: 0 }),
  bloom: new BloomEffect({ intensity: 0.45, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 }),
  vignette: new VignetteEffect({ offset: 0.32, darkness: 0.55 }),
  noise: new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN }),
  ca: new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0006), radialModulation: true, modulationOffset: 0.4 }),
};
fx.noise.blendMode.opacity.value = 0.07;
composer.addPass(new EffectPass(camera, fx.dof));
{ const p = new RenderPass(overlay, camera); p.clearPass.enabled = false; p.ignoreBackground = true; composer.addPass(p); }
composer.addPass(new EffectPass(camera, fx.bloom, fx.ca, fx.vignette, fx.noise));
// focus: CoC is read from the cocMaterial (setting dof.target alone does nothing)
export function setFocus(distance, range = 400, bokeh = null) {
  fx.dof.cocMaterial.focusDistance = distance; fx.dof.cocMaterial.focusRange = range;
  if (bokeh != null) fx.dof.bokehScale = bokeh;
}
export const manifest = await fetch('/captured/manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);

// ---------------------------------------------------------------- the film
let film, T, TIMING, at = {}, DURATION = 1, FRAMES = 60, BEATS = [], lastT = -1;
const $ = (id) => document.getElementById(id);
// Resolve the timing table: numbers are seconds from the start; { after: 'key', by: s }
// rides along with another action; keys ending in "Dur" are lengths.
const isDur = (k) => /Dur$/.test(k);
function resolve(tbl) {
  const out = {}, busy = new Set();
  const get = (k) => {
    if (k in out) return out[k];
    const v = tbl[k];
    if (v == null) throw new Error(`timing: no key "${k}"`);
    if (busy.has(k)) throw new Error(`timing: "${k}" depends on itself`);
    busy.add(k);
    out[k] = typeof v === 'number' ? v : get(v.after) + v.by;
    busy.delete(k);
    return out[k];
  };
  for (const k of Object.keys(tbl)) get(k);
  return out;
}
function applyTiming() {
  at = resolve(TIMING);
  film.retime(at);
  DURATION = at.end ?? 10;
  FRAMES = Math.round(DURATION * FPS);
  BEATS = film.BEATS.map((b) => ({ name: b.name, t: at[b.at] ?? 0 })).sort((a, b) => a.t - b.t);
  for (const c of copyLines) c.win = typeof c.on === 'function' ? c.on(at) : [at[c.on[0]], at[c.on[1]]];
}

// ---------------------------------------------------------------- captions (DOM over the canvas)
let copyLines = [], copyEls = {}, copyDy = 0, onCopyFrame = () => {};
function buildCopy() {
  copyLines = film.COPY.map((c) => ({ ...c }));
  for (const c of copyLines) {
    const el = document.createElement('div');
    el.className = `copy ${c.cls}`; el.dataset.id = c.id;
    const sp = document.createElement('span'); sp.textContent = c.text; el.appendChild(sp);
    el.style.top = `${c.top}px`;
    ui.appendChild(el); copyEls[c.id] = el;
  }
}
function drawCopy(t) {
  for (const c of copyLines) {
    const [t0, t1] = c.win, k = span(t0, t1, c.fadeIn ?? 0.5, c.fadeOut ?? 0.35)(t), el = copyEls[c.id];
    el.style.opacity = k.toFixed(3);
    el.classList.toggle('live', k > 0.05);
    el.style.transform = `translateY(${((c.cls === 'big' || c.cls === 'mid' || c.cls === 'kicker' ? copyDy : 0) + (1 - k) * 18).toFixed(2)}px)`;
  }
  onCopyFrame();
}

// ---------------------------------------------------------------- frame + motion blur
function update(t) { film.update(t, at); drawCopy(t); }
const NOISE_OPACITY = fx.noise.blendMode.opacity.value;
let blur = null;
const blurGL = (() => {
  let fbTex = null, accum = null; const size = new THREE.Vector2();
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), scn = new THREE.Scene(); scn.add(quad);
  const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  // the screen holds sRGB bytes: decode to linear, weight, add; average back to sRGB
  const addMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, weight: { value: 1 } }, vertexShader: vert,
    fragmentShader: `uniform sampler2D tSrc; uniform float weight; varying vec2 vUv; vec3 dec(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); } void main(){ gl_FragColor = vec4(dec(texture2D(tSrc, vUv).rgb) * weight, 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false });
  const outMat = new THREE.ShaderMaterial({ uniforms: { tAcc: { value: null } }, vertexShader: vert,
    fragmentShader: `uniform sampler2D tAcc; varying vec2 vUv; vec3 enc(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); } void main(){ gl_FragColor = vec4(enc(texture2D(tAcc, vUv).rgb), 1.0); }`,
    depthTest: false, depthWrite: false });
  function ensure() {
    renderer.getDrawingBufferSize(size);
    if (fbTex && fbTex.image.width === size.x && fbTex.image.height === size.y) return;
    fbTex?.dispose(); accum?.dispose();
    fbTex = new THREE.FramebufferTexture(size.x, size.y);
    accum = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
  }
  return {
    begin() { ensure(); const cc = renderer.getClearColor(new THREE.Color()), a = renderer.getClearAlpha(); renderer.setRenderTarget(accum); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); renderer.setClearColor(cc, a); renderer.setRenderTarget(null); },
    add(w) { renderer.setRenderTarget(null); renderer.copyFramebufferToTexture(fbTex); addMat.uniforms.tSrc.value = fbTex; addMat.uniforms.weight.value = w; quad.material = addMat; renderer.setRenderTarget(accum); renderer.render(scn, ortho); renderer.setRenderTarget(null); },
    show() { outMat.uniforms.tAcc.value = accum.texture; quad.material = outMat; renderer.setRenderTarget(null); renderer.render(scn, ortho); },
  };
})();
function sampleTime(t, ts) {
  for (const c of film.cuts(at)) {   // hard cuts the shutter must not smear across
    if (t < c && ts >= c) return c - 1e-4;
    if (t >= c && ts < c + 0.002) return c + 0.002;
  }
  return Math.max(0, Math.min(DURATION, ts));
}
function renderBlurred(t) {
  const N = blur.samples, sh = blur.shutter, mid = Math.floor(N / 2);
  blurGL.begin();
  for (let i = 0; i < N; i++) {
    const ts = sampleTime(t, t + (N === 1 ? 0 : (i / (N - 1) - 0.5) * sh));
    fx.noise.blendMode.opacity.value = i === mid ? Math.min(1, NOISE_OPACITY * N) : 0;   // grain from one sample, not averaged away
    update(ts); composer.render(1 / FPS); blurGL.add(1 / N);
  }
  fx.noise.blendMode.opacity.value = NOISE_OPACITY;
  update(t); blurGL.show();
}
function seekTime(t, fast = false) {
  t = Math.max(0, Math.min(DURATION, t));
  if (blur && blur.samples > 1 && !fast) renderBlurred(t);
  else { update(t); composer.render(1 / FPS); }
  lastT = t;
  transport?.sync(t);
}

// ---------------------------------------------------------------- fonts (caption type presets)
// h = headline [family, weight, tracking, size multiplier, line height], s = sub line,
// w = wordmark (fall back to h). Add presets per project; the Font menu cycles them.
export const FONTS = {
  inter: { name: 'Inter 600', h: ['Inter', 600, '-0.025em', 0.8, 1.08], s: ['Inter', 400, '0', 0.9] },
  tracked: { name: 'Inter caps, tracked', h: ['Inter', 700, '0.16em', 0.42, 1.3], case: 'uppercase', ws: '0.3em', dy: 30, s: ['Inter', 500, '0.12em', 0.62], scase: 'uppercase', w: ['Inter', 600, '0.18em', 0.5] },
  grotesk: { name: 'Space Grotesk 600', h: ['Space Grotesk', 600, '-0.02em', 0.78, 1.08], s: ['Space Grotesk', 400, '0', 0.9] },
  serif: { name: 'Instrument Serif + Inter', h: ['Instrument Serif', 400, '-0.01em', 0.95, 1.05], s: ['Inter', 400, '0.01em', 0.9], w: ['Instrument Serif', 400, '0', 1] },
  manrope: { name: 'Manrope 800', h: ['Manrope', 800, '-0.03em', 0.74, 1.05], s: ['Manrope', 500, '0', 0.9] },
};
let fontKey = 'inter', fontFavs = new Set();
async function setFont(key) {
  const f = FONTS[key] ?? FONTS.inter; fontKey = FONTS[key] ? key : 'inter';
  const hh = f.h, sub = f.s ?? f.h, w = f.w ?? f.h, st = ui.style;
  st.setProperty('--hf', `"${hh[0]}"`); st.setProperty('--hw', hh[1]); st.setProperty('--ht', hh[2]); st.setProperty('--hs', hh[3]); st.setProperty('--hl', hh[4] ?? 1.05);
  st.setProperty('--hws', f.ws ?? 'normal'); st.setProperty('--hcase', f.case ?? 'none'); st.setProperty('--hcol', f.col ?? '#fff');
  st.setProperty('--sf', `"${sub[0]}"`); st.setProperty('--sw', sub[1]); st.setProperty('--st', sub[2]); st.setProperty('--ss', sub[3]); st.setProperty('--scase', f.scase ?? 'none');
  st.setProperty('--wf', `"${w[0]}"`); st.setProperty('--ww', w[1]); st.setProperty('--wt', w[2]); st.setProperty('--ws', w[3]);
  copyDy = f.dy ?? 0;
  await Promise.all([[hh, 96], [sub, 34], [w, 88]].map(([ff, px]) => document.fonts.load(`${ff[1]} ${px}px "${ff[0]}"`).catch(() => {})));
  const sel = $('fontSel'); if (sel && sel.value !== fontKey) sel.value = fontKey;
  if (lastT >= 0) seekTime(lastT);
}

// ---------------------------------------------------------------- review UI (hidden in renders)
const BAR = 64, PANEL_W = 520;
function fit() {
  const open = $('timing').classList.contains('open');
  const availW = window.innerWidth - (open ? PANEL_W : 0);
  const s = Math.min(availW / W, (window.innerHeight - BAR) / H, 1);
  stage.style.transform = `translate(${Math.round((availW - W * s) / 2)}px, ${Math.round((window.innerHeight - BAR - H * s) / 2)}px) scale(${s})`;
}
let transport = null;
function makeTransport() {
  const scrub = $('scrub'), tcS = $('tcS'), tcF = $('tcF'), play = $('play'), marks = $('marks'), beats = $('beats');
  const notesEl = $('notes'), notesList = $('notesList'), noteCount = $('noteCount'), noteInput = $('noteInput'), noteText = $('noteText');
  let playing = null, notes = [], lastBeat = -1;
  const frame = () => Math.round(lastT * FPS);
  const go = (t) => { stop(); seekTime(t); };
  const goF = (f) => go(Math.max(0, Math.min(FRAMES - 1, f)) / FPS);
  const beatMarks = [], beatChips = [];
  BEATS.forEach((b, i) => {
    const m = document.createElement('div'); m.className = 'mark'; marks.appendChild(m); beatMarks.push(m);
    const c = document.createElement('button'); c.textContent = b.name; c.onclick = () => go(BEATS[i].t); beats.appendChild(c); beatChips.push(c);
  });
  function refresh() {
    scrub.max = String(FRAMES - 1); $('tcN').textContent = String(FRAMES);
    BEATS.forEach((b, i) => { beatMarks[i].style.left = `${(b.t / DURATION) * 100}%`; beatChips[i].title = `${b.t.toFixed(2)}s`; });
    renderNotes();
  }
  function stop() { if (playing) { cancelAnimationFrame(playing); playing = null; play.textContent = 'Play'; if (blur) seekTime(lastT); } }
  function start() {
    if (playing) return;
    const t0 = lastT >= DURATION - 1 / FPS ? 0 : lastT, startMs = performance.now() - t0 * 1000;
    play.textContent = 'Pause';
    const loop = () => { const t = (performance.now() - startMs) / 1000; if (t >= DURATION) { seekTime(DURATION - 1 / FPS); stop(); return; } seekTime(t, true); playing = requestAnimationFrame(loop); };
    playing = requestAnimationFrame(loop);
  }
  const toggle = () => (playing ? stop() : start());
  play.onclick = toggle;
  $('stepB').onclick = () => goF(frame() - 1); $('stepF').onclick = () => goF(frame() + 1);
  scrub.addEventListener('input', () => go(Number(scrub.value) / FPS));
  // notes: timestamped, saved to assets/review/notes.json so the agent can read them
  const fmt = (t) => `${t.toFixed(2)}s`;
  async function loadNotes() { try { notes = await (await fetch('/__notes')).json(); } catch { notes = []; } renderNotes(); }
  function renderNotes() {
    noteCount.textContent = String(notes.length);
    [...marks.querySelectorAll('.mark.note')].forEach((m) => m.remove());
    notesList.innerHTML = notes.length ? '' : '<li class="empty">No notes yet. Press N at any frame.</li>';
    for (const n of notes) {
      const m = document.createElement('div'); m.className = 'mark note'; m.style.left = `${(n.t / DURATION) * 100}%`; marks.appendChild(m);
      const li = document.createElement('li');
      li.innerHTML = `<span class="t">${fmt(n.t)}</span><span>${n.text.replace(/</g, '&lt;')}</span><span class="x" title="Delete">×</span>`;
      li.onclick = (e) => { if (!e.target.classList.contains('x')) go(n.t); };
      li.querySelector('.x').onclick = async (e) => { e.stopPropagation(); notes = await (await fetch('/__notes', { method: 'DELETE', body: JSON.stringify({ id: n.id }) })).json(); renderNotes(); };
      notesList.appendChild(li);
    }
  }
  function openNoteInput() { stop(); noteInput.classList.add('open'); noteText.value = ''; noteText.placeholder = `Note at ${fmt(lastT)} (Enter saves, Esc cancels)`; noteText.focus(); }
  const closeNoteInput = () => { noteInput.classList.remove('open'); noteText.blur(); };
  $('noteBtn').onclick = openNoteInput;
  $('noteSave').onclick = async () => { const text = noteText.value.trim(); closeNoteInput(); if (!text) return; notes = await (await fetch('/__notes', { method: 'POST', body: JSON.stringify({ t: Number(lastT.toFixed(3)), frame: frame(), text }) })).json(); renderNotes(); notesEl.classList.add('open'); };
  noteText.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('noteSave').onclick(); if (e.key === 'Escape') closeNoteInput(); });
  $('notesToggle').onclick = () => notesEl.classList.toggle('open');
  $('notesClose').onclick = () => notesEl.classList.remove('open');
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
    const big = e.shiftKey ? FPS : 1;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goF(frame() + big); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goF(frame() - big); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(DURATION - 1 / FPS);
    else if (e.key >= '1' && e.key <= '9' && BEATS[Number(e.key) - 1]) go(BEATS[Number(e.key) - 1].t);
    else if (e.key === 'n' || e.key === 'N') openNoteInput();
  });
  loadNotes(); refresh();
  return {
    refresh, go, stop, beatName: () => BEATS[Math.max(0, lastBeat)]?.name ?? '',
    sync(t) {
      const f = Math.round(t * FPS);
      scrub.value = String(f); tcS.textContent = t.toFixed(3); tcF.textContent = String(f);
      let cur = 0; for (let i = 0; i < BEATS.length; i++) if (t >= BEATS[i].t - 1e-6) cur = i;
      beatChips.forEach((c, i) => c.classList.toggle('on', i === cur));
      if (cur !== lastBeat) { lastBeat = cur; document.dispatchEvent(new CustomEvent('beatchange', { detail: BEATS[cur]?.name })); }
      document.dispatchEvent(new CustomEvent('playhead', { detail: t }));
    },
  };
}

// Timing drawer: one row per action, only the current beat's rows, rows running at
// the playhead lit up. Edits apply live and autosave to assets/review/timing.json.
function makeTimingPanel() {
  const el = $('timing'), list = $('timingList'), state = $('timingState'), derived = $('timingDerived');
  const keys = Object.keys(T);
  let showAll = false, beat = '', saveTimer = null;
  const rows = keys.map((k) => {
    const row = document.createElement('div'); row.className = 'trow';
    const lab = document.createElement('span'); lab.className = 'tl'; lab.textContent = film.LABELS?.[k] ?? k; lab.title = k; row.appendChild(lab);
    const unit = document.createElement('span'); unit.className = 'tu'; unit.textContent = isDur(k) ? 'len' : 's'; row.appendChild(unit);
    const inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.05'; row.appendChild(inp);
    const jump = document.createElement('button'); jump.className = 'tj'; jump.textContent = '→'; jump.title = 'Jump here'; row.appendChild(jump);
    inp.addEventListener('input', () => {
      const v = Number(inp.value); if (!Number.isFinite(v)) return;
      const cur = TIMING[k];
      if (typeof cur === 'number') TIMING[k] = v; else TIMING[k] = { ...cur, by: v - at[cur.after] };
      apply(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400);
    });
    jump.onclick = () => transport.go(isDur(k) ? 0 : at[k]);
    list.appendChild(row);
    return { k, row, inp };
  });
  // which beat a row belongs to: time rows by their time, length rows with the row above them
  function beatOf(i) {
    let j = i; while (j > 0 && isDur(keys[j])) j--;
    const t = at[keys[j]]; let name = BEATS[0]?.name;
    for (const b of BEATS) if (t >= b.t - 1e-6) name = b.name;
    return name;
  }
  function refilter() {
    rows.forEach((r, i) => { r.row.hidden = !showAll && beatOf(i) !== beat; });
    $('timingBeat').textContent = showAll ? 'all beats' : beat; $('timingAll').textContent = showAll ? 'This beat' : 'All';
  }
  function refreshRows() {
    for (const r of rows) {
      if (document.activeElement !== r.inp) r.inp.value = (isDur(r.k) ? at[r.k] : at[r.k]).toFixed(2);
      r.row.classList.toggle('changed', JSON.stringify(TIMING[r.k]) !== JSON.stringify(T[r.k]));
    }
    derived.textContent = BEATS.map((b) => `${b.name} ${b.t.toFixed(2)}s`).join(' · ') + ` · Runtime ${DURATION.toFixed(2)}s`;
  }
  // a row is "running" between key0 and key1 for pairs (x0/x1); otherwise for 0.35 s after its time
  function spanOf(k) {
    if (isDur(k)) return null;
    const m = /^(.*)([01])$/.exec(k);
    if (m && `${m[1]}0` in at && `${m[1]}1` in at) return [at[`${m[1]}0`], at[`${m[1]}1`]];
    return [at[k], at[k] + 0.35];
  }
  function highlight(t) {
    if (!el.classList.contains('open')) return;
    for (const r of rows) { const sp = spanOf(r.k); r.row.classList.toggle('active', !!sp && t >= sp[0] && t <= sp[1]); r.row.classList.toggle('past', !!sp && t > sp[1]); }
  }
  function apply() { applyTiming(); transport.refresh(); refreshRows(); seekTime(Math.min(Math.max(lastT, 0), DURATION - 1 / FPS)); }
  async function save() { await fetch('/__timing', { method: 'POST', body: JSON.stringify(TIMING) }); state.textContent = 'saved'; }
  async function reset() { await fetch('/__timing', { method: 'DELETE' }); TIMING = structuredClone(T); apply(); }
  document.addEventListener('beatchange', (e) => { beat = e.detail; refilter(); });
  document.addEventListener('playhead', (e) => highlight(e.detail));
  $('timingAll').onclick = () => { showAll = !showAll; refilter(); };
  const toggle = (on) => { el.classList.toggle('open', on); beat = transport.beatName(); refilter(); highlight(Math.max(lastT, 0)); fit(); };
  $('timingToggle').onclick = () => toggle(); $('timingClose').onclick = () => toggle(false);
  $('timingSave').onclick = save; $('timingReset').onclick = reset;
  window.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return; if (e.key === 't' || e.key === 'T') toggle(); });
  refreshRows(); refilter();
}

// Caption editor (E / Text button): drag to move (snaps to centre), corner or scroll to
// resize, side edges to wrap, double-click to retype. Saves to assets/review/copy.json.
let copyEdits = {};
function applyCopyEdit(c) {
  const o = copyEdits[c.id] ?? {}, el = copyEls[c.id], sp = el.firstChild;
  if (!sp.isContentEditable) sp.textContent = o.text ?? c.text;
  el.style.top = `${o.top ?? c.top}px`;
  el.style.translate = o.dx ? `${o.dx}px 0` : '';
  el.style.setProperty('--k', String(o.size ?? c.size ?? 1));
  const w = o.w ?? c.w; sp.style.display = w ? 'inline-block' : ''; sp.style.width = w ? `${w}px` : '';
}
function makeCopyEditor() {
  let on = false, sel = null, typing = null, lastWheel = 0; const undo = [];
  const box = $('copyBox'), guide = $('copyGuide'), btn = $('copyToggle');
  const byId = Object.fromEntries(copyLines.map((c) => [c.id, c]));
  const scale = () => stage.getBoundingClientRect().width / W;
  const edit = (id) => copyEdits[id] ?? (copyEdits[id] = {});
  const readText = (sp) => [...sp.childNodes].map((n) => (n.nodeName === 'BR' ? '\n' : n.textContent)).join('').replace(/\n+$/, '');
  let saveTimer = null;
  const save = () => { for (const [id, o] of Object.entries(copyEdits)) if (!Object.keys(o).length) delete copyEdits[id]; clearTimeout(saveTimer); saveTimer = setTimeout(() => fetch('/__copy', { method: 'POST', body: JSON.stringify(copyEdits) }), 250); };
  const snapshot = () => { undo.push(JSON.stringify(copyEdits)); if (undo.length > 200) undo.shift(); };
  function place() {
    const el = sel && copyEls[sel];
    if (!on || !el || !el.classList.contains('live')) { box.style.display = 'none'; return; }
    const r = el.firstChild.getBoundingClientRect(), pad = 10 * scale();
    Object.assign(box.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    $('copySize').textContent = `${Math.round(parseFloat(getComputedStyle(el).fontSize))}px`;
  }
  function select(id) { if (sel && sel !== id) finishTyping(true); if (sel) copyEls[sel].classList.remove('sel'); sel = id; if (sel) copyEls[sel].classList.add('sel'); place(); }
  function setOn(v) { on = v; ui.classList.toggle('editing', on); btn.classList.toggle('on', on); if (!on) { finishTyping(true); select(null); guide.style.display = 'none'; } }
  function resize(id, k) { const o = edit(id); o.size = +Math.min(4, Math.max(0.2, k)).toFixed(3); applyCopyEdit(byId[id]); place(); }
  function startTyping(id) {
    if (typing) finishTyping(true); select(id);
    const sp = copyEls[id].firstChild; typing = { id, before: sp.textContent };
    sp.contentEditable = 'plaintext-only'; sp.focus();
    const r = document.createRange(); r.selectNodeContents(sp); const g = getSelection(); g.removeAllRanges(); g.addRange(r); place();
  }
  function finishTyping(keep) {
    if (!typing) return; const { id, before } = typing; typing = null;
    const sp = copyEls[id].firstChild, text = readText(sp);   // textContent: keeps the typed case under text-transform
    sp.removeAttribute('contenteditable'); getSelection().removeAllRanges();
    if (keep && text.trim() && text !== before) { snapshot(); const o = edit(id); if (text === byId[id].text) delete o.text; else o.text = text; save(); }
    applyCopyEdit(byId[id]); place();
  }
  const drag = (e, onMove) => { e.preventDefault(); e.stopPropagation(); snapshot(); const move = (ev) => onMove(ev); const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); guide.style.display = 'none'; save(); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); };
  ui.addEventListener('mousedown', (e) => {
    if (!on) return; const sp = e.target.closest('.copy > span'); if (!sp || sp.isContentEditable) return;
    transport.stop(); const id = sp.parentElement.dataset.id, c = byId[id]; select(id);
    const o = edit(id), s = scale(), x0 = e.clientX, y0 = e.clientY, top0 = o.top ?? c.top, dx0 = o.dx ?? 0;
    drag(e, (ev) => {
      let nx = Math.round(dx0 + (ev.clientX - x0) / s); const snap = !ev.altKey && Math.abs(nx) < 16; if (snap) nx = 0;
      o.dx = nx; o.top = Math.round(top0 + (ev.clientY - y0) / s); if (!o.dx) delete o.dx;
      applyCopyEdit(c); place();
      const r = stage.getBoundingClientRect();
      Object.assign(guide.style, { display: snap ? 'block' : 'none', left: `${r.left + r.width / 2}px`, top: `${r.top}px`, height: `${r.height}px` });
    });
  });
  box.querySelector('.grip').addEventListener('mousedown', (e) => {
    if (!sel) return; const id = sel, r = copyEls[id].firstChild.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d0 = Math.max(12, Math.hypot(e.clientX - cx, e.clientY - cy)), k0 = copyEdits[id]?.size ?? byId[id].size ?? 1;
    drag(e, (ev) => resize(id, k0 * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0));
  });
  for (const side of box.querySelectorAll('.side')) side.addEventListener('mousedown', (e) => {
    if (!sel) return; const id = sel, s = scale(), sign = side.classList.contains('r') ? 1 : -1, x0 = e.clientX;
    const w0 = copyEdits[id]?.w ?? byId[id].w ?? copyEls[id].firstChild.getBoundingClientRect().width / s;
    drag(e, (ev) => { edit(id).w = Math.round(Math.max(120, Math.min(W, w0 + (2 * sign * (ev.clientX - x0)) / s))); applyCopyEdit(byId[id]); place(); });
  });
  ui.addEventListener('wheel', (e) => {
    if (!on) return; const sp = e.target.closest('.copy > span'); if (!sp) return; e.preventDefault();
    const id = sp.parentElement.dataset.id; select(id); if (performance.now() - lastWheel > 500) snapshot(); lastWheel = performance.now();
    resize(id, (copyEdits[id]?.size ?? byId[id].size ?? 1) * (e.deltaY < 0 ? 1.03 : 1 / 1.03)); save();
  }, { passive: false });
  ui.addEventListener('dblclick', (e) => { if (!on) return; const sp = e.target.closest('.copy > span'); if (sp && !sp.isContentEditable) startTyping(sp.parentElement.dataset.id); });
  ui.addEventListener('keydown', (e) => { if (!typing) return; e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishTyping(true); } else if (e.key === 'Escape') { e.preventDefault(); finishTyping(false); } });
  ui.addEventListener('input', () => place());
  ui.addEventListener('focusout', () => finishTyping(true));
  stage.addEventListener('mousedown', (e) => { if (on && !e.target.closest('.copy > span')) select(null); });
  $('copySmaller').onclick = () => { if (sel) { snapshot(); resize(sel, (copyEdits[sel]?.size ?? byId[sel].size ?? 1) / 1.06); save(); } };
  $('copyBigger').onclick = () => { if (sel) { snapshot(); resize(sel, (copyEdits[sel]?.size ?? byId[sel].size ?? 1) * 1.06); save(); } };
  $('copyType').addEventListener('mousedown', (e) => e.preventDefault());
  $('copyType').onclick = () => { if (sel && !typing) startTyping(sel); };
  $('copyReset').onclick = () => { if (sel && copyEdits[sel]) { snapshot(); delete copyEdits[sel]; applyCopyEdit(byId[sel]); place(); save(); } };
  btn.onclick = () => setOn(!on);
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || typing) return;
    if (e.key === 'e' || e.key === 'E') setOn(!on);
    else if (on && e.key === 'Escape') select(null);
    else if (on && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (undo.length) { copyEdits = JSON.parse(undo.pop()); copyLines.forEach(applyCopyEdit); place(); save(); } }
  });
  window.addEventListener('resize', () => place());
  onCopyFrame = () => { if (on) place(); };
}

// ---------------------------------------------------------------- start
export async function start(theFilm) {
  film = theFilm;
  T = film.TIMING;
  TIMING = structuredClone(T);
  // saved review state: timing overrides, caption edits, font pick
  const saved = await fetch('/__timing').then((r) => r.json()).catch(() => null);
  if (saved) for (const [k, v] of Object.entries(saved)) if (k in TIMING) TIMING[k] = v;
  copyEdits = await fetch('/__copy').then((r) => r.json()).catch(() => ({})) ?? {};
  const fonts = await fetch('/__fonts').then((r) => r.json()).catch(() => ({})) ?? {};
  fontFavs = new Set(fonts.favorites ?? []);
  await film.build();
  buildCopy();
  copyLines.forEach(applyCopyEdit);
  applyTiming();
  // review UI
  window.addEventListener('resize', fit); fit();
  transport = makeTransport();
  makeTimingPanel();
  makeCopyEditor();
  const sel = $('fontSel');
  for (const [k, f] of Object.entries(FONTS)) { const o = document.createElement('option'); o.value = k; o.textContent = f.name; sel.appendChild(o); }
  sel.onchange = async () => { await setFont(sel.value); await fetch('/__fonts', { method: 'POST', body: JSON.stringify({ pick: fontKey, favorites: [...fontFavs] }) }); };
  const cycle = async (d) => { const ks = Object.keys(FONTS); sel.value = ks[(ks.indexOf(fontKey) + d + ks.length) % ks.length]; await sel.onchange(); };
  $('fontPrev').onclick = () => cycle(-1); $('fontNext').onclick = () => cycle(1);
  {
    const b = $('blurToggle');
    const set = (v) => { blur = v ? { samples: 16, shutter: 1 / 60 } : null; b.classList.toggle('on', v); b.textContent = v ? 'Blur on' : 'Blur off'; if (lastT >= 0) seekTime(lastT); };
    b.onclick = () => set(!blur);
    window.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return; if (e.key === 'b' || e.key === 'B') set(!blur); });
  }
  await document.fonts.ready;
  await setFont(new URLSearchParams(location.search).get('font') ?? fonts.pick ?? film.FONT ?? 'inter');
  // upload every texture and compile every shader now: first-time uploads mid-playback drop frames
  for (const tp of texCache.values()) renderer.initTexture(await tp);
  for (let t = 0; t < DURATION; t += 0.2) seekTime(t, true);
  seekTime(0);
}

window.__film = {
  fps: FPS, get frames() { return FRAMES; }, get duration() { return DURATION; }, get beats() { return BEATS; }, get at() { return at; }, get timing() { return TIMING; },
  // what the score needs: the moments to hit and the two downbeat anchors, in seconds
  get hits() { return (film.hits?.(at) ?? []).filter((h) => h.t != null).sort((a, b) => a.t - b.t); },
  get music() {
    const m = film.MUSIC; if (!m) return null;
    const from = at[m.from], to = at[m.to];
    return { from, to, bars: m.bars ?? Math.max(1, Math.round(((to - from) * (m.bpm ?? 100)) / 240)) };
  },
  seekTime, seek: (f) => seekTime(f / FPS),
  setBlur: (b) => { blur = b && b.samples > 1 ? { samples: b.samples | 0, shutter: b.shutter } : null; },
  get blur() { return blur; },
  renderMode: () => { for (const id of ['hud', 'notes', 'timing', 'copyBox']) { const e = $(id); if (e) e.style.display = 'none'; } stage.style.transform = 'none'; window.removeEventListener('resize', fit); },
  ready: null,
};
window.__dbg = { THREE, camera, scene, overlay, fx, composer };
