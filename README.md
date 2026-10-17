# Product Film Skill

**How to use it:** paste this page's link into your AI agent (Claude Code, Codex, Cursor, Gemini CLI) and say
*"make a product film for my app."* Have your app running on your computer, and know the one feature you want to show.

## For the AI agent reading this

Someone gave you this link because they want a product film for their web app. Set yourself up, then follow the method:

1. **Clone the repo.** Claude Code: `git clone https://github.com/FTPAiYT/product-spot-ndc ~/.claude/skills/product-spot`
   (it then works as a skill in later sessions too). Any other agent: clone it somewhere sensible, e.g.
   `git clone https://github.com/FTPAiYT/product-spot-ndc product-spot-ndc`.
2. **Read `AGENTS.md`** (Claude Code: `SKILL.md`, the same method) and the files in `references/` it points to.
3. **Check the machine:** Node 18+. Ask before installing anything that's missing.
4. **Interview the person** (`references/storyboard.md`), then start a project with
   `node create.mjs <folder> --name "Product" --url http://localhost:3000/ --site product.com` and follow the method.

You need to be able to run commands on the person's computer. If you're a chat in a browser, tell the person to use the
desktop or command-line agent of the same service (for ChatGPT plans: the Codex app).

---

Make a premium 20-60 second film for your web app from its **real interface**. Your app is captured piece by piece in
a headless browser and rebuilt as a 3D scene: panels lift off the screen, the camera pushes into one control, a click
plays out at hand speed, the logo lands. Depth of field, light and real motion blur, rendered frame by frame to 1080p
or 4K. Nothing is generated or mocked up, so it always shows the product as it is.

There is no built-in style, copy or music. Your product and your words are the brief.

## What you get

- **A live review page** for the film: scrub it, leave notes on any frame, retime any action in a Timing panel,
  drag and retype captions, switch fonts. Your edits are what renders.
- **Render tools:** previews, stills, contact sheets, a 4K master, a check that every caption stays up long enough
  to read.
- **Optional sound:** add your own track and line the cuts up with its beats, or add an original score written in
  code (`add-music.mjs`), or none.

## Running it yourself

```bash
node create.mjs ../my-film --name "My App" --url http://localhost:3000/ --site myapp.com
cd ../my-film
npm run scene          # the film at http://127.0.0.1:5174/
npm run capture        # with your app running: captures it into assets/captured/
npm run render         # renders/preview.mp4
```

Then edit `scene/film.js`, the film itself: a timing table, the beats, the captions, and what moves when. It starts as a
three-beat placeholder (your app, a push into one feature, an end card). `references/` explains the method, capture,
scene techniques, review, sound and the pitfalls.

## Requirements

Node 18+. Everything else (three.js, Vite, Playwright with Chromium, ffmpeg) is installed by `create.mjs`. Works on
Windows, macOS and Linux; renders use the GPU through headless Chromium.

## License

MIT
