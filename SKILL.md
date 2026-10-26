---
name: product-spot
description: Make a premium 20-60 second product film (ad, launch video, feature spot) for a web app from its REAL interface - the app is captured piece by piece in a headless browser and composited in a 3D scene with a moving camera, depth of field and motion blur, then rendered frame by frame to 1080p/4K. Includes a live review page (scrubber, timing panel, caption editor, notes). Trigger when someone wants an ad, promo, launch video, trailer or "Apple-style" product video for their own app or website. Music is optional (a licensed track, none, or an add-on that writes a score in code).
---

# A product film from the real app

The result is a 1080p (or 4K) film in which the person's actual interface is the set: panels lift off the app, the
camera pushes into one control, a click plays out at hand speed, the logo lands. Nothing is generated or mocked up;
every pixel on screen was captured from their running app, so it is always true to the product. The kit has no look
of its own: no house palette, no house copy, no house music. The person's product and their words are the brief.

Read `references/method.md` first. The other references are opened when their stage comes up.

## Setting up

```
node <skill folder>/create.mjs <project-folder> --name "Product" --url http://localhost:3000/ --site product.com
cd <project-folder>
npm run scene        # the film, live, at http://127.0.0.1:5174/ with the review tools
```

`create.mjs` installs Node packages and Playwright's Chromium. The person's app must run locally (or be reachable at a
URL) so it can be captured. Work on a copy if you need to change the app (demo data, a dev hook); never touch their repo.

## The shape of the work

1. **Interview, one round** (`references/storyboard.md`). What the product is in one line, the ONE feature the film
   exists to show, the before/after a viewer can judge at a glance, what's on screen (their own demo content), where it
   runs, how long, where it will be posted. Then a **beat table** (time, shot, copy) and wait for their go.
2. **Capture** (`references/capture.md`). Get the app into each state the film needs and save each moving piece as its
   own image with its rectangle (`capture/plan.mjs`, helpers in `capture/lib.mjs`): the whole app, every element that
   lifts or moves on its own (transparent), every state change as a sequence, the app's own animations as frames.
3. **Build beat by beat** (`references/scene.md`). Replace the starter in `scene/film.js` with their storyboard. Every
   action time is a row in the `TIMING` table, so the person can retime anything in the Timing panel without code.
   Render stills of each beat (`npm run render -- --stills 2,5,9`) and LOOK at them before showing anything.
4. **Review rounds** (`references/review.md`). They scrub the live scene, leave notes, drag captions, change timing
   rows. You render previews (`npm run render`), read `assets/review/notes.json`, fix exactly what was named, and
   re-render. Taste calls (fonts, copy, a look) are rendered side by side, never argued in prose.
5. **Sound, only if they want it** (`references/music.md`). Ask once whether the film has music: their own licensed
   track, none, or an original score written in code (`node <skill folder>/add-music.mjs <project>`). Never add music
   on your own initiative. Recommend a real track over the code score. With a track the music comes first and the
   picture follows: read it (`tools/read-track.py`), pin the story moments to its section changes, put clicks and
   captions on its accents (`tools/beat-lock.mjs --beats`), and let the screen act on the track (muffle it while an
   effect is off) instead of adding music on top.
6. **Final.** `node tools/bake-timing.mjs` (the agreed timing goes into the code), a 4K master
   (`npm run render -- --scale 2 --crf 16 --out renders/final-4k.mp4`), a contact sheet (`npm run sheet`), caption
   read-times (`npm run holds`). Check the file before sending it.

## Rules

- **Real UI only.** Capture it; never redraw or mock the interface. If a state can't be reached, add demo data to a copy
  of the app, don't fake the pixels.
- **Their product, their words.** Copy names what the product does in the person's plain words, one idea per line.
  Don't import slogans, brand comparisons, or a style from another ad, including any example in this skill.
- **One idea per beat, hand-speed actions.** A click takes as long as a hand would. Every payoff gets a hold.
- **Show frames early.** Render 5-10 seconds of real output before building far; people react to frames, not plans.
- **Taste calls are boards.** Fonts, copy variants, colours: options rendered on real frames, side by side.
- **Notes are literal.** Change what was named, one-for-one, nothing next to it.
- **The premium version by default.** When a beat works but looks cheap, make it good before showing it: depth,
  light, easing, overlap, a shadow that belongs. Don't make the person ask.
- **Verify before sending.** Look at your own stills and contact sheets; say plainly what was and wasn't checked.
