# Sound (optional)

Music is the person's call. Ask once, during the interview, and do nothing until they answer:

- **No music.** Fine for a silent autoplay hero video or a social post with captions. Render without `--audio`.
- **Their own track** (licensed stock, a commission, their own music). Put it in `assets/music/`, render with
  `--audio assets/music/track.wav`, and cut the picture to it (below).
- **An original score written in code.** Only if they ask for it: `node <skill folder>/add-music.mjs <project>` adds
  `music/` (a Web Audio synth, a starter arrangement and a renderer) and `npm run score`. Never add it unprompted.

## Cutting picture to a track

- Find the track's tempo and first downbeat (by ear, from its metadata, or with a beat tracker).
- `film.js` `hits(at)` lists the moments that should land on the music (clicks, snaps, reveals, cuts, the logo), each
  naming its timing row (`key`). `MUSIC = { from, to, bpm }` names two moments that must both be downbeats.
- `node tools/beat-lock.mjs` lists each hit's distance from the nearest beat; `--apply` moves the rows onto it (saved
  like a Timing drawer edit). Rows that drive the tempo are left alone.
- A click 40 ms off the beat reads as "the edit is slightly off" even when nobody can say why.

## If they asked for an original score

The add-on writes music against the film's own timing, so the music re-fits whenever the timing changes:

- The tempo is derived from the picture: the whole number of bars between `MUSIC.from` and `MUSIC.to` nearest `bpm`.
- `music/score.js` is a starter arrangement (quiet intro, a groove from `from`, a landing at `to`, accents on hits).
  Rewrite it for this film: their genre words are the brief. `music/synth.js` has the instruments (pad, keys, pluck,
  mallet, bass, kick, clap, hat, bell, riser, swell, impact) and mix tools (pump, muffle, fadeOut).
- `npm run score` renders it offline and masters it: one fixed gain to -14 LUFS plus a limiter. Not single-pass
  loudness normalisation, which flattens the dynamics so a quiet intro comes out as loud as the drop.
- Render options as short clips on the picture and let them listen; describe nothing in prose.

What was learned the hard way:

- Write the score in a blank page, not inside the film page (two heavy loads in one tab can crash it).
- Low, kick-only openings disappear on laptop and phone speakers. Give low sounds harmonics (soft clip, an octave
  triangle) and check on small speakers.
- Any effect that bends pitch or time at the start (a tape spin-up, a wobble) puts the first beats off tempo against
  the rest. Keep the grid exact.
- Synthesized "real-world" sounds (tape clunks, latches, foley) sound fake. Use real recordings with a licence that
  allows it, or leave them out.
- Harsh highs tire the ear fast: roll off bright pads and hats before adding more.
