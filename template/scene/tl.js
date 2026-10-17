// Deterministic keyframe tracks. Everything in the film is a pure function of
// time so any frame can be rendered in isolation, in any order.
export const ease = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outSoftBack: (t) => { const c1 = 0.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

function lerpV(a, b, f) {
  if (typeof a === 'number') return a + (b - a) * f;
  return a.map((x, i) => x + (b[i] - x) * f);
}

// keys: [{ t, v, e? }] in ascending t. v = number | number[]. e = easing used
// to arrive AT this key from the previous one. Holds before/after the range.
export function track(keys, defaultEase = ease.inOutCubic) {
  return (time) => {
    if (time <= keys[0].t) return keys[0].v;
    for (let i = 1; i < keys.length; i++) {
      if (time <= keys[i].t) {
        const a = keys[i - 1], b = keys[i];
        const span = b.t - a.t;
        const u = span <= 0 ? 1 : (time - a.t) / span;
        return lerpV(a.v, b.v, (b.e || defaultEase)(u));
      }
    }
    return keys[keys.length - 1].v;
  };
}

// 0 before t0, 1 after t1, eased in between.
export function ramp(t0, t1, e = ease.inOutCubic) {
  return (time) => (time <= t0 ? 0 : time >= t1 ? 1 : e((time - t0) / (t1 - t0)));
}

// Fade in over [t0, t0+dIn], hold, fade out over [t1-dOut, t1].
export function span(t0, t1, dIn = 0.4, dOut = 0.4, eIn = ease.outCubic, eOut = ease.inCubic) {
  return (time) => {
    if (time <= t0 || time >= t1) return 0;
    if (time < t0 + dIn) return eIn((time - t0) / dIn);
    if (time > t1 - dOut) return 1 - eOut((time - (t1 - dOut)) / dOut);
    return 1;
  };
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const mix = (a, b, f) => a + (b - a) * f;
