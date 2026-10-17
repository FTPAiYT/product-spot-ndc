// THE SCORE: a starter arrangement written against the film's own timing. Replace it
// with music for THIS film (references/music.md); keep the grid and the hit lock.
//   window.__score.render(info, opts) → Promise<AudioBuffer>
//   info = { duration, music: { from, to, bars }, hits: [{ t, kind }], beats: [{ name, t }] }
//
// The grid comes from the picture: the tempo is chosen so `music.from` and `music.to`
// are both downbeats, `bars` bars apart (film.js MUSIC). Move either moment in the
// Timing panel and the whole score re-fits on the next render.
(() => {
  // a four-chord loop (MIDI voicings + bass). Transpose all of it with opts.key (semitones).
  const PROG = [
    { v: [57, 60, 64, 67, 71], bass: 45 },   // Am9
    { v: [53, 57, 60, 64, 67], bass: 41 },   // Fmaj9
    { v: [48, 55, 59, 62, 64], bass: 36 },   // Cadd9
    { v: [55, 59, 62, 64, 69], bass: 43 },   // G6/9
  ];
  const END_CHORD = { v: [45, 52, 57, 60, 64, 67, 71], bass: 33 };

  function render(info, opts = {}) {
    const k = Synth.create(info.duration);
    const key = opts.key ?? 0, tr = (c) => ({ v: c.v.map((m) => m + key), bass: c.bass + key });

    // ---- grid from the picture
    const m = info.music ?? { from: 0, to: info.duration - 3, bars: 8 };
    const BAR = (m.to - m.from) / m.bars, BEAT = BAR / 4, E8 = BEAT / 2;
    const before = Math.ceil(m.from / BAR - 1e-6);
    const T0 = m.from - before * BAR;                    // first bar line, at or before 0
    const barAt = (i) => T0 + i * BAR;
    const FROM = before, TO = before + m.bars;           // bar numbers of the two anchors
    const BREAK = TO - 1;                                // last bar before the landing: drums out, riser
    const chordAt = (i) => tr(PROG[((i % 4) + 4) % 4]);
    k.setDelay(E8 * 1.5);                                // dotted-eighth delay, in tempo

    // ---- sections, bar by bar
    for (let i = 0; i < TO; i++) {
      const t = barAt(i), next = barAt(i + 1), ch = chordAt(i), groove = i >= FROM && i !== BREAK;
      k.pad(t, next, ch.v, { vel: groove ? 0.85 : 0.6, cutoff: groove ? 1700 : 1000, attack: i === 0 ? 0.8 : 0.25, release: 0.35 });
      if (!groove) {                                     // intro: a soft arpeggio over the pad
        const tones = [ch.v[0] + 12, ch.v[2] + 12, ch.v[4], ch.v[3] + 12];
        for (let s = 0; s < 8; s++) k.mallet(t + s * E8, tones[s % 4], { vel: 0.3 * (s % 2 ? 0.7 : 1), pan: s % 2 ? 0.3 : -0.3 });
        continue;
      }
      k.chord(t, ch.v.slice(1).map((x) => x + 12), { vel: 0.4 });
      for (let b = 0; b < 8; b++) k.bass(t + b * E8, ch.bass + (b === 7 ? 12 : 0), E8 * 0.82, { vel: b % 2 ? 0.48 : 0.7 });
      const arp = [ch.v[0] + 24, ch.v[2] + 12, ch.v[4] + 12, ch.v[3] + 12, ch.v[1] + 24, ch.v[2] + 24, ch.v[4] + 12, ch.v[3] + 24];
      for (let s = 0; s < 8; s++) k.pluck(t + s * E8, arp[s], { vel: 0.55 * (s % 2 ? 0.7 : 1), pan: s % 2 ? 0.35 : -0.35 });
      const full = i >= FROM + 2;                        // claps join two bars in
      for (let b = 0; b < 4; b++) {
        const bt = t + b * BEAT;
        k.kick(bt, { vel: b === 0 ? 1 : 0.85 });
        if (full && b % 2) k.clap(bt, { vel: 0.5 });
        k.hat(bt + E8, { vel: 0.16, open: b === 3 });
        k.pump(k.buses.pad, bt, BEAT); k.pump(k.buses.bass, bt, BEAT);
      }
    }
    k.swell(barAt(FROM), { len: 0.9, vel: 0.14 });       // drums arrive
    k.riser(barAt(BREAK), m.to, { vel: 0.28 });          // into the landing
    k.swell(m.to, { len: 1.4, vel: 0.22 });

    // ---- accents locked to the picture (film.js hits). Snap their times to the grid
    // in the Timing panel (tools/beat-lock.mjs) so these play on the beat.
    let n = 0;
    for (const h of info.hits) {
      const ch = chordAt(Math.floor((h.t - T0) / BAR)), top = ch.v.map((x) => x + 24);
      if (h.kind === 'logo') continue;                   // the landing below
      if (h.kind === 'reveal') { k.swell(h.t, { len: 0.8, vel: 0.14 }); k.bell(h.t, top[4], { vel: 0.55 }); }
      else if (h.kind === 'cut') k.swell(h.t, { len: 1, vel: 0.18 });
      else k.bell(h.t, top[[1, 2, 4, 3][n++ % 4]], { vel: 0.45, pan: ((n % 3) - 1) * 0.4 });   // click / snap / anything else
    }

    // ---- the landing at music.to: impact + one big open chord held to the end
    const end = tr(END_CHORD), tail = info.duration - m.to;
    k.impact(m.to);
    k.pad(m.to, info.duration - 1.2, end.v, { vel: 1, cutoff: 2600, attack: 0.04, release: 1.1 });
    k.chord(m.to, end.v.slice(2).map((x) => x + 12), { vel: 0.5, dur: Math.max(3, tail) });
    k.bell(m.to + 0.02, end.v[4] + 24, { vel: 0.5 });
    k.fadeOut(info.duration - 1.4, info.duration - 0.45);
    return k.ctx.startRendering();
  }

  window.__score = { render };
})();
