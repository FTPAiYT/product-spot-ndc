# Building the scene (scene/film.js)

`film.js` is the only file you write per film. `engine.js` runs it and provides the tools; read its exports when you
need something below.

## The contract

| Export | What it is |
|---|---|
| `TIMING`, `LABELS` | one row per action (see method.md) and its plain label for the Timing drawer |
| `BEATS` | `[{ name, at: 'key' }]`: chips in the transport, and the drawer's grouping |
| `COPY` | captions: `{ id, text, cls, top, on: ['k0','k1'] or (at) => [t0, t1], w?, size?, fadeIn?, fadeOut? }` |
| `FONT` | the default type treatment (`FONTS` in engine.js; the person can switch live) |
| `build()` | load textures, make planes; runs once |
| `retime(at)` | rebuild tracks from resolved times; runs on every timing edit |
| `update(t, at)` | set everything for time `t`; pure function of time |
| `cuts(at)` | hard cuts (motion blur never smears across them) |
| `hits(at)`, `MUSIC` | optional, only for a soundtrack cut to picture (music.md) |

## Tools (engine.js / tl.js)

- `track([{ t, v, e }])`: keyframes of numbers or arrays, eased per key, held outside the range.
  `ramp(t0, t1, e)`: 0 to 1. `span(t0, t1, in, out)`: fade in, hold, fade out. `ease.*`: the curves.
- `plane(w, h, basicMat(tex))`, `loadTex(cap(file))`, `placeholderTex(label, w, h)`.
- `ax(x)`, `ay(y)`: capture pixels to world. `FIT_Z`: camera distance that shows the 1920x1080 frame 1:1.
- `seqMaterial` + `setSeq(mat, frames, idx)`: play a captured sequence, crossfading between frames.
- `makeShadow(plane, sx, sy, dy)`: a soft contact shadow under a lifted piece.
- `makeCursor(group)`: an arrow cursor whose tip lands on its target despite perspective; `pressScaleAt(t, clicks)`.
- `setFocus(distance, range, bokeh)`: depth of field, set every frame to the distance of what the viewer should read.
- `fx`: bloom, vignette, noise, chromatic aberration, dof: tune per film, sparingly.
- `scene` (with depth of field) and `overlay` (drawn after it, sharp): thin lines, outlines and glows go in `overlay`,
  or the depth of field smears them into ghosts.

## Techniques that read as premium

- **Camera moves from projection, not guesswork.** To frame a piece at 45% of the width, solve the distance from the
  field of view (see the starter's push). To land a piece where it will live, place it at its captured rect.
- **Lift, don't slide.** A piece leaving the app rises toward the camera (z), grows 2-4%, gains a soft shadow, and the
  app behind it darkens and falls back. Swap the app texture to the capture without that piece on the same frame.
- **Light as information.** A soft band of light moving across a list reads as a wave only when it is continuous per
  pixel (a shader with a moving gaussian), not row-by-row switching, which reads as steps. Pace it linearly; easing
  makes it race through the middle and park at the end.
- **Hand-speed cursor.** Ease into targets, a 0.12-0.2 s press, a beat of stillness after the result.
- **Overlap.** The next move starts before the last one ends (`{ after: 'x1', by: -0.3 }`). Nothing waits in a row.
- **Holds after payoffs.** The viewer needs ~1 s to register a result before anything else moves.
- **Depth of field follows attention.** Focus on what is read; let everything else go soft. Keep bokeh off when the
  whole frame should read (the opening app shot).
- **Colour from the product.** Accents come from the app's own palette; the end card can be plain.
- **Motion blur on every render** (16 samples, 180° shutter). Without it fast moves step.

## Captions

Captions are DOM text over the canvas, styled by the treatment in `FONTS` and the `cls` (`big`, `mid`, `small`,
`kicker`, `wordmark`). The person can drag, resize and retype any line in the caption editor (Text button); edits save
to `assets/review/copy.json` and apply to renders. Fold agreed edits back into `COPY` before the final.
A caption needs about 1 s + 0.3 s per word on screen: `npm run holds` lists any that are too short.
