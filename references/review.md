# Review: the scene page is the tool

`npm run scene` serves the film at `http://127.0.0.1:5174/`. Open it for the person; don't just paste a URL. Everything
below is hidden in renders.

- **Transport.** Play (space), frame step (arrows, shift = 1 s), a scrubber with beat chips. Blur button (B) shows the
  paused frame with motion blur, as it will render.
- **Notes.** "+ Note" saves a note at the current frame to `assets/review/notes.json`. Read that file at the start of
  every round; each note has its time, so you know exactly which frame it's about.
- **Timing drawer.** One row per action, for the current beat. Rows light up while their action runs, so the person
  can see which number owns the motion on screen. Edits apply live and save to `assets/review/timing.json`; renders
  use them. Relative rows show absolute times and save their offset.
- **Caption editor.** Text button: drag a line to move it (snaps to the centre), drag the corner or scroll to resize,
  double-click to retype. Saves to `assets/review/copy.json`.
- **Fonts.** The menu switches type treatments live; ☆ marks favourites; the pick is saved and used by renders.

## Rendering

```
npm run render -- --stills 2.5,6,9          stills (look at these yourself first)
npm run render                               1080p30 preview with motion blur -> renders/preview.mp4
npm run render -- --start 10 --end 14        one stretch
npm run render -- --scale 2 --crf 16 --out renders/final-4k.mp4     4K master
npm run render -- --audio track.wav          with a soundtrack
npm run sheet -- --step 0.5 --from 8 --to 14  contact sheet of a stretch (--crop x,y,w,h to zoom on a detail)
npm run holds                                 caption read-times
```

Don't edit `film.js` or `engine.js` while a render runs: the dev server reloads the page and the render picks up a
half-loaded film. Stop the render first.

## Each round

1. Read `notes.json` and anything they said or sent (screenshots name a frame; find it by its content).
2. Fix exactly what was named. Taste calls go on a side-by-side board of rendered options.
3. Stills of what changed, checked by you. Then a preview.
4. Send the preview with one line of what changed. Keep versioned copies (`renders/v3.mp4`) so they can compare.
5. Commit.
