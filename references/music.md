# Sound (optional)

Music is the person's call. Ask once, during the interview, and do nothing until they answer:

- **Their own track** (licensed stock, a commission, their own music). The recommended route: it is what makes the
  film sound finished. Put it in `assets/music/`, cut the picture to it (below), render with `--audio`.
- **No music.** Fine for a silent autoplay hero video or a social post with captions. Render without `--audio`.
- **An original score written in code.** Only if they ask for it, and say plainly what it is: a sketch. Every
  attempt to make code-written music sound polished (better synth voices, sampled instruments, other genres, other
  tempos) still read as cheap next to a produced track. `node <skill folder>/add-music.mjs <project>` adds it.
  Never add it unprompted.

If a track does not land, let them pick another; your ear is not in the room. Two candidates that fit the film's
length and shape beat a week of tuning one.

## Cutting picture to a track: music first, picture follows

The track is fixed and the picture is flexible, so the picture moves. Order matters:

1. **Read the track.** `python tools/read-track.py assets/music/track.mp3` (needs librosa) writes
   `track.beats.json` and prints its tempo, key, first downbeat, which beats carry the accents, the bars where its
   sections change (the bass enters, a drop, a breakdown, the return, the ending) and its biggest hits. A track
   whose length and section changes already sit near the film's big moments needs nudges, not a re-cut.
2. **Pin the story moments to sections.** Each big moment of the film goes on a section change or one of the
   biggest hits: the app leaving, the first feature landing, the cut to a new feature, the logo. Pin them with
   `--pin key=seconds`. A transition can ride a breakdown and land its cut on the drop that ends it.
3. **Lock the hits.** `node tools/beat-lock.mjs --beats assets/music/track.beats.json` lists every hit in
   `film.js` `hits(at)` and the move it would make; add `--apply` to save. Pins first, then the rest.
4. **Look and listen, then fix by ear.** Render stills at each pinned moment, then a preview with the track.

### What "on the beat" means

- **Clicks go on the accents, not the nearest beat.** The nearest detected beat is often a weak one: technically on
  the grid, but nobody hears it as the beat. `--on accents` (the default) uses the pair of beats that hits harder in
  this track: 1 and 3 when it is kick-led, 2 and 4 when the claps or snare carry it. read-track says which.
- **When the person says a moment should land on a different beat, pin it exactly where they say.** "That click
  should be a second later, on the beat" means one specific beat they can hear. Do not reinterpret it as a rule.
- **Everything that marks a moment goes on the music, not only clicks:** captions appearing and leaving (a short
  fade, about 0.3 s, starting on the beat, so the words land rather than drift in), toggles, entrances, a card
  landing, the cursor's exit, the camera settling.
- **Ripples stay ripples.** Several things answering one action (cards snapping in turn) go on consecutive eighths:
  give their hits the same `group` and beat-lock lays them out. Snapped one by one, two of them collapse onto one beat.
- **Keep the lead-ins.** A cursor arrives a beat before its click, a pull-back starts after it. Chain those rows
  (`after`) to the row that moves, so they travel with it instead of being snapped on their own.
- A click 40 ms off the beat reads as "the edit is slightly off" even when nobody can say why.

## Sound that follows the picture

The track carries the music. Let the screen act on the track instead of piling sounds on top of it:

- **The interface's states, on the music itself.** When the film turns an effect off (a "Show grade" toggle, a
  before/after), muffle the whole track: a lowpass from full range to about 650 Hz over 80 ms, a dB quieter, and back
  open over about 120 ms when it comes back on. A slider that makes the image darker or brighter tilts the track the
  same way (down to about 1400 Hz as it goes dark, open again as it comes back).
- **Quiet UI clicks** on the cursor's clicks: a short bright tick, felt more than heard.

What did not hold up, so leave it out unless they ask:

- Tuned pings or bells on clicks and snaps, even in the track's key: they read as a second song.
- Whooshes on camera moves.
- Panning the track with something that moves left and right: it reads as a speaker fault, and phones play mono.

## If they asked for an original score

The add-on writes music against the film's own timing, so the music re-fits whenever the timing changes:

- The tempo is derived from the picture: the whole number of bars between `MUSIC.from` and `MUSIC.to` nearest `bpm`.
  beat-lock without `--beats` snaps hits to that grid. Watch the tempo it lands on: a picture-derived tempo can sit
  between styles (about 100 BPM is neither relaxed nor dance) and make everything feel off. Try a few bar counts.
- `music/score.js` is a starter arrangement (quiet intro, a groove from `from`, a landing at `to`, accents on hits).
  Rewrite it for this film: their genre words are the brief. `music/synth.js` has the instruments (pad, keys, pluck,
  mallet, bass, kick, clap, hat, bell, riser, swell, impact) and mix tools (pump, muffle, fadeOut).
- `npm run score` renders it offline and masters it: one fixed gain to -14 LUFS plus a limiter. Not single-pass
  loudness normalisation, which flattens the dynamics so a quiet intro comes out as loud as the drop.
- Render options as short clips on the picture and let them listen; describe nothing in prose.

What was learned the hard way:

- Write the score in a blank page, not inside the film page (two heavy loads in one tab can crash it).
- One feel all the way through. When the bass switches from long notes to eighths mid-film, or an echo is set to a
  different rhythm than the beat (dotted eighths against straight ones), it sounds like two tempos fighting.
- Electric-piano style FM chords with a bright attack that settles ("twowww") are distracting under picture.
- Low, kick-only openings disappear on laptop and phone speakers. Give low sounds harmonics (soft clip, an octave
  triangle) and check on small speakers.
- Any effect that bends pitch or time at the start (a tape spin-up, a wobble) puts the first beats off tempo against
  the rest. Keep the grid exact.
- Synthesized "real-world" sounds (tape clunks, latches, foley) sound fake. Use real recordings with a licence that
  allows it, or leave them out.
- Harsh highs tire the ear fast: roll off bright pads and hats before adding more.
