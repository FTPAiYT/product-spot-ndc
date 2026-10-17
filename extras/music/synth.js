// A small synth studio in Web Audio, for a score written in code and rendered offline
// (OfflineAudioContext: same result every time, faster than real time, no samples).
//   const k = Synth.create(seconds)  → instruments + buses + effects on one context
//   ...schedule notes...
//   const buffer = await k.ctx.startRendering()
// Every instrument takes absolute seconds. Times below 0 are skipped, so a pattern
// can start on a bar line before the film does.
(() => {
  const SR = 48000;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // note names → MIDI: n('C4') = 60, n('F#3') = 54, n('Bb2') = 46
  const n = (name) => {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
    if (!m) throw new Error(`note: ${name}`);
    return 12 * (Number(m[3]) + 1) + { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  };

  function create(seconds) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
    const now = (t) => Math.max(0, t);
    const env = (g, t, a, peak, d) => {
      g.gain.setValueAtTime(0.0001, now(t)); g.gain.exponentialRampToValueAtTime(peak, now(t) + a); g.gain.exponentialRampToValueAtTime(0.0001, now(t) + a + d);
    };
    const pan = (p) => { const s = ctx.createStereoPanner(); s.pan.value = p; return s; };
    const shaper = (k) => { const w = ctx.createWaveShaper(), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } w.curve = c; w.oversample = '2x'; return w; };

    // ---------------------------------------------------------------- master chain
    // instruments → bus → tone (a lowpass you can automate: muffle / open the mix)
    // → master → rumble HP → glue compressor → safety limiter
    const master = ctx.createGain(); master.gain.value = 0.8;
    const rumble = ctx.createBiquadFilter(); rumble.type = 'highpass'; rumble.frequency.value = 28;
    const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -20; glue.ratio.value = 2.5; glue.knee.value = 8; glue.attack.value = 0.02; glue.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -4; limit.ratio.value = 20; limit.knee.value = 0; limit.attack.value = 0.002; limit.release.value = 0.08;
    master.connect(rumble).connect(glue).connect(limit).connect(ctx.destination);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.5; tone.frequency.value = 20000; tone.connect(master);

    // reverb: decaying stereo noise impulse, darker in the tail
    const verb = ctx.createConvolver();
    {
      const len = Math.floor(3.2 * SR), ir = ctx.createBuffer(2, len, SR);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c); let lp = 0;
        for (let i = 0; i < len; i++) { const x = i / len, k = 0.15 + 0.8 * x; lp += (1 - k) * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - x, 2.2) * (i < SR * 0.012 ? i / (SR * 0.012) : 1); }
      }
      verb.buffer = ir;
    }
    const verbIn = ctx.createGain(), verbHP = ctx.createBiquadFilter(); verbHP.type = 'highpass'; verbHP.frequency.value = 220;
    verbIn.connect(verbHP).connect(verb).connect(tone);
    // stereo ping-pong delay; set its time once the tempo is known: k.setDelay(seconds)
    const dIn = ctx.createGain(), dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = ctx.createGain(), dlp = ctx.createBiquadFilter(), merge = ctx.createChannelMerger(2), dOut = ctx.createGain();
    dl.delayTime.value = dr.delayTime.value = 0.375; fb.gain.value = 0.36; dlp.type = 'lowpass'; dlp.frequency.value = 3200; dOut.gain.value = 0.5;
    dIn.connect(dl); dl.connect(dr); dr.connect(dlp).connect(fb).connect(dl); dl.connect(merge, 0, 0); dr.connect(merge, 0, 1); merge.connect(dOut); dOut.connect(tone); dOut.connect(verbIn);
    const setDelay = (s) => { dl.delayTime.value = dr.delayTime.value = s; };

    const bus = (g, into = tone) => { const b = ctx.createGain(); b.gain.value = g; b.connect(into); return b; };
    const send = (from, to, g) => { const s = ctx.createGain(); s.gain.value = g; from.connect(s).connect(to); };
    const padHP = ctx.createBiquadFilter(); padHP.type = 'highpass'; padHP.frequency.value = 170; padHP.connect(tone);
    const kickClip = shaper(2.2);
    const buses = {
      pad: bus(0.32, padHP), keys: bus(0.42), arp: bus(0.2), bass: bus(0.55), drums: bus(0.62), bell: bus(0.3, master), fx: bus(0.45),
    };
    kickClip.connect(buses.drums);
    send(buses.pad, verbIn, 0.5); send(buses.keys, verbIn, 0.45); send(buses.keys, dIn, 0.12); send(buses.arp, dIn, 0.5); send(buses.arp, verbIn, 0.35);
    send(buses.bell, verbIn, 0.9); send(buses.bell, dIn, 0.35); send(buses.drums, verbIn, 0.12); send(buses.fx, verbIn, 0.6);

    const noise = ctx.createBuffer(1, SR * 3, SR);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const noiseSrc = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.start(now(t), Math.random() * 1.5, dur + 0.05); return s; };

    // ---------------------------------------------------------------- instruments
    // warm pad: three detuned saws per note across the stereo field, slow breathing lowpass
    function pad(t0, t1, notes, { vel = 1, cutoff = 1300, attack = 0.4, release = 0.5 } = {}) {
      if (t1 + release < 0) return;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(cutoff * 0.6, now(t0)); f.frequency.linearRampToValueAtTime(cutoff, now(t0) + attack + 0.5);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = cutoff * 0.22; lfo.connect(lg).connect(f.frequency);
      const hold = Math.max(now(t0) + attack, t1), stop = hold + release + 0.1;
      lfo.start(now(t0)); lfo.stop(stop);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now(t0)); g.gain.linearRampToValueAtTime(vel, now(t0) + attack); g.gain.setValueAtTime(vel, hold); g.gain.linearRampToValueAtTime(0.0001, hold + release);
      f.connect(g).connect(buses.pad);
      for (const m of notes) for (const [det, p] of [[-9, -0.7], [0, 0], [9, 0.7]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det + (Math.random() - 0.5) * 3;
        const og = ctx.createGain(); og.gain.value = 0.06; o.connect(og).connect(pan(p)).connect(f); o.start(now(t0)); o.stop(stop);
      }
    }
    // electric piano: two-operator FM, bright attack settling into a round tone
    function keys(t, m, { vel = 0.5, dur = 2.2, pan: p = 0 } = {}) {
      if (t + dur < 0) return;
      const f = mtof(m), c = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
      c.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 2.2, now(t)); mg.gain.exponentialRampToValueAtTime(f * 0.25, now(t) + 0.9); mod.connect(mg).connect(c.frequency);
      const tine = ctx.createOscillator(), tg = ctx.createGain(); tine.frequency.value = f * 14; tg.gain.setValueAtTime(f * 1.5, now(t)); tg.gain.exponentialRampToValueAtTime(1, now(t) + 0.06); tine.connect(tg).connect(c.frequency);
      const g = ctx.createGain(); env(g, t, 0.006, vel * 0.35, dur); c.connect(g).connect(pan(p)).connect(buses.keys);
      for (const o of [c, mod, tine]) { o.start(now(t)); o.stop(now(t) + dur + 0.1); }
    }
    // a chord on the keys, strummed a few ms per note
    const chord = (t, notes, { vel = 0.45, dur = 2.4, strum = 0.035 } = {}) => notes.forEach((m, i) => keys(t + i * strum, m, { vel: vel * (1 - i * 0.07), dur, pan: (i - (notes.length - 1) / 2) * 0.2 }));
    // pluck: filtered saw + square with a snappy filter envelope (arpeggios)
    function pluck(t, m, { vel = 0.5, pan: p = 0, bright = 4200 } = {}) {
      if (t < 0) return;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = mtof(m) * 1.002;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(bright, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.22);
      const g = ctx.createGain(); env(g, t, 0.003, vel * 0.3, 0.32);
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(pan(p)).connect(buses.arp);
      o.start(t); o2.start(t); o.stop(t + 0.45); o2.stop(t + 0.45);
    }
    // mallet: sine body + a quiet octave; the soft voice for quiet sections
    function mallet(t, m, { vel = 0.5, pan: p = 0 } = {}) {
      if (t < 0) return;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain(); o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 2; g2.gain.value = 0.12;
      const g = ctx.createGain(); env(g, t, 0.008, vel * 0.42, 0.55); o.connect(g); o2.connect(g2).connect(g); g.connect(pan(p)).connect(buses.arp);
      o.start(t); o2.start(t); o.stop(t + 0.7); o2.stop(t + 0.7);
    }
    // sub bass with a triangle an octave up, so it still reads on phone and laptop speakers
    function bass(t, m, dur, { vel = 0.8 } = {}) {
      if (t + dur < 0) return;
      const o = ctx.createOscillator(), h = ctx.createOscillator(), hg = ctx.createGain(); o.frequency.value = mtof(m); h.type = 'triangle'; h.frequency.value = mtof(m) * 2; hg.gain.value = 0.32;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now(t)); g.gain.linearRampToValueAtTime(vel, now(t) + 0.012); g.gain.setValueAtTime(vel, now(t) + Math.max(0.02, dur - 0.06)); g.gain.linearRampToValueAtTime(0.0001, now(t) + dur);
      o.connect(g); h.connect(hg).connect(g); g.connect(buses.bass); o.start(now(t)); h.start(now(t)); o.stop(now(t) + dur + 0.05); h.stop(now(t) + dur + 0.05);
    }
    // kick: fast pitch drop into a ~45 Hz body through a soft clipper (harmonics small
    // speakers can play) plus a short click
    function kick(t, { vel = 1 } = {}) {
      if (t < 0) return;
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.08);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.9, t + 0.002); g.gain.setValueAtTime(vel * 0.9, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(kickClip); o.start(t); o.stop(t + 0.55);
      const s = noiseSrc(t, 0.012), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const ng = ctx.createGain(); env(ng, t, 0.0005, vel * 0.22, 0.008); s.connect(hp).connect(ng).connect(buses.drums);
    }
    function clap(t, { vel = 0.5 } = {}) {
      if (t < 0) return;
      const s = noiseSrc(t, 0.3), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      for (const o of [0, 0.011, 0.022]) { g.gain.setValueAtTime(vel, t + o); g.gain.exponentialRampToValueAtTime(vel * 0.15, t + o + 0.009); }
      g.gain.setValueAtTime(vel * 0.7, t + 0.034); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      s.connect(bp).connect(g).connect(pan(0.05)).connect(buses.drums); const v = ctx.createGain(); v.gain.value = 0.5; g.connect(v).connect(verbIn);
    }
    // metallic hat: six square waves at the classic 808 ratios, bandpassed high
    // (plain noise hats sound like static)
    function hat(t, { vel = 0.2, open = false } = {}) {
      if (t < 0) return;
      const len = open ? 0.26 : 0.045;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 0.9;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const g = ctx.createGain(); env(g, t, 0.001, vel * 0.55, len);
      for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * 1.4; o.connect(bp); o.start(t); o.stop(t + len + 0.05); }
      bp.connect(hp).connect(g).connect(pan(0.22)).connect(buses.drums);
    }
    // glassy FM bell: accents on clicks, snaps and reveals
    function bell(t, m, { vel = 0.5, pan: p = 0, dur = 2.6 } = {}) {
      if (t < 0) return;
      const f = mtof(m), c = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
      c.frequency.value = f; mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.4); mod.connect(mg).connect(c.frequency);
      const g = ctx.createGain(); env(g, t, 0.002, vel * 0.32, dur); c.connect(g).connect(pan(p)).connect(buses.bell);
      c.start(t); mod.start(t); c.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
    }
    // filtered-noise riser from t0 into a hit at t1, with a rising tone underneath
    function riser(t0, t1, { vel = 0.3 } = {}) {
      const s = noiseSrc(t0, t1 - t0 + 0.1), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(350, now(t0)); bp.frequency.exponentialRampToValueAtTime(9000, t1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now(t0)); g.gain.exponentialRampToValueAtTime(vel, t1 - 0.02); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
      s.connect(bp).connect(g).connect(buses.fx);
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(220, now(t0)); o.frequency.exponentialRampToValueAtTime(880, t1);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, now(t0)); og.gain.exponentialRampToValueAtTime(vel * 0.12, t1 - 0.02); og.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
      o.connect(og).connect(buses.fx); o.start(now(t0)); o.stop(t1 + 0.1);
    }
    // reverse swell (a cymbal played backwards) landing on t
    function swell(t, { len = 1.2, vel = 0.22 } = {}) {
      const s = noiseSrc(t - len, len), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now(t - len)); g.gain.exponentialRampToValueAtTime(vel, t - 0.01); g.gain.linearRampToValueAtTime(0.0001, t + 0.01);
      s.connect(hp).connect(g).connect(buses.fx);
    }
    // the big landing (logo / end card): sub drop, soft noise burst and a kick
    function impact(t, { vel = 1 } = {}) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(32, t + 1.8);
      const g = ctx.createGain(); env(g, t, 0.004, 0.95 * vel, 3.6); o.connect(g).connect(buses.drums); o.start(t); o.stop(t + 4);
      const s = noiseSrc(t, 2), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.2);
      const ng = ctx.createGain(); env(ng, t, 0.002, 0.35 * vel, 1.6); s.connect(lp).connect(ng).connect(buses.fx);
      kick(t, { vel });
    }
    // sidechain feel: duck a bus on each beat (pad and bass breathing with the kick)
    function pump(b, t, beat, depth = 0.55) {
      const g = b.gain, base = g.value;
      g.setValueAtTime(base, t); g.linearRampToValueAtTime(base * (1 - depth), t + 0.012); g.linearRampToValueAtTime(base, t + beat * 0.75);
    }
    // the mix through a closed door / muffled until t, then open (or the reverse)
    function muffle(t0, t1, hz = 600) { const f = tone.frequency; f.setValueAtTime(20000, now(t0)); f.exponentialRampToValueAtTime(hz, now(t0) + 0.09); f.setValueAtTime(hz, t1); f.exponentialRampToValueAtTime(20000, t1 + 0.3); }
    function fadeOut(t0, t1) { master.gain.setValueAtTime(master.gain.value, t0); master.gain.linearRampToValueAtTime(0.0001, t1); }

    return {
      ctx, SR, mtof, n, now, env, pan, master, tone, buses, verbIn, delayIn: dIn, setDelay,
      pad, keys, chord, pluck, mallet, bass, kick, clap, hat, bell, riser, swell, impact, pump, muffle, fadeOut,
    };
  }

  // 16-bit stereo WAV as base64, normalised to -1 dBFS peak (crosses the devtools bridge in chunks)
  function toWavB64(buf) {
    const len = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const k = peak > 0 ? 0.89 / peak : 1;
    const out = new DataView(new ArrayBuffer(44 + len * 4));
    const s = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    s(0, 'RIFF'); out.setUint32(4, 36 + len * 4, true); s(8, 'WAVE'); s(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); s(36, 'data'); out.setUint32(40, len * 4, true);
    for (let i = 0; i < len; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true); }
    const bytes = new Uint8Array(out.buffer), chunks = [];
    for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    return { b64: btoa(chunks.join('')), peak };
  }

  window.Synth = { create, toWavB64, mtof, n };
})();
