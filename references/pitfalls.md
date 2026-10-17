# Pitfalls (all hit for real)

## three.js / postprocessing

- Depth of field reads the depth buffer. A plane with `depthWrite: false` gets the focus of whatever is behind it and
  blurs while "in focus". Hero pieces write depth; only thin overlays don't.
- `DepthOfFieldEffect` constructor focus values are initial only. Set focus live on `dof.cocMaterial.focusDistance` /
  `.focusRange` (world units) every frame: `setFocus()`.
- Thin lines and outlines in the main scene get ghosted by depth of field. Draw them in `overlay` (after the DOF pass).
- A plane faded to opacity 0 still writes depth and hides what's behind it. Set `.visible = false` near 0.
- Stacked transparent planes get re-sorted by depth every frame; a small camera move reorders them and a soft edge
  punches a hole in the plane behind. Give them explicit `renderOrder`.
- `new THREE.Color(r, g, b)` with plain numbers is read as LINEAR. For an sRGB colour use a hex string:
  `new THREE.Color('#4f8cff')`. Otherwise colours come out pale.
- Upload every texture and compile every shader at load (the engine warms up by seeking through the film). First-time
  uploads mid-playback drop frames on the first play.
- Pieces that leave the UI must appear exactly where they live: place them at their captured rect and derive camera
  poses by projection. Hand-placed numbers make an element appear centred and then travel.
- Anything the app decides from layout (which edge a line leaves from) must be decided once from the final layout, not
  per frame, or it flips on a single frame mid-move.
- A cursor drawn nearer the camera than its target misses it on screen (perspective). Move it back along the camera ray
  so its tip projects onto the target (`makeCursor` does).

## Capture

- Zero rotations before capturing; re-apply in the scene.
- An element's own fringe (an inset rim, a sub-pixel edge) shows as a dark line when a photo plane sits exactly on it.
  Overscan the inner plane by 2-3 px.
- After a view switch an app may remount elements; anything you tagged is gone. Re-query after every switch.
- Wait for fonts before capturing (`document.fonts.ready`, then load each face you use). `networkidle` is not enough.

## Tooling

- Vite on Windows dies with `EBUSY` when a capture rewrites a watched folder. The template ignores `assets/` and
  `renders/` and serves them from disk itself (also so files written after start-up are served).
- Editing `film.js` while a render runs reloads the page under the render. Stop renders before editing.
- Newer npm blocks install scripts; `ffmpeg-static` fetches its binary in one. `create.mjs` runs it by hand if missing.
- Playwright needs `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` (Windows) for WebGL on the real GPU headless.
- `innerText` returns text-transformed capitals; read caption text with `textContent`.
- `[hidden]` loses to an author `display:` rule; the page adds `[hidden]{display:none!important}`.

## Working with the person

- A dev server with an SPA fallback answers 200 with the wrong page for a missing URL. Check what opened (its title)
  before saying it's open.
- Diagnosing taste in prose burns trust. Render the alternatives, say one line, let them pick.
- Unsaved edits are lost on reload; the drawer autosaves, but say so when you need them to reload.
- When something they asked for reads as cheap, the fix is the premium version of the same idea, not a different idea.
