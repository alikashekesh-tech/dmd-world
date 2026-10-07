# DMD World — website showcase video (Remotion)

A ~4.5 minute 1080p walkthrough of every page of the store: an opening slide with chapter timestamps, each page
scrolling inside a browser window with circled features and short explanations, a mobile chapter, and an outro.
The soundtrack is generated in code (no samples or licensed music).

## Make the video

The store's dev server must be running at http://127.0.0.1:5173 (`npm run dev` in the project root).

```bash
cd video
npm install
npm run capture   # screenshots, animation clips and target positions -> public/shots, public/seq
npm run music     # calm ambient track, exactly as long as the video -> public/music.wav
npm run render -- --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"
```

The result is `out/dmd-world-showcase.mp4`. `npm run studio` opens Remotion Studio to scrub through it.

## Changing it

- **What's shown and said:** `src/script.mjs`. Each chapter lists scroll stops; each stop lists notes
  (`target` = a key captured in `public/shots/manifest.json`, `title`, `text`).
- **Which elements can be circled:** the `targets` selectors in `scripts/capture.mjs`. Re-run `npm run capture`
  after changing the site or the selectors (`npm run capture -- shop cart` re-captures just those).
- **Timing:** `src/timeline.mjs` (note length, intro/outro length). Re-run `npm run music` afterwards so the
  soundtrack matches the new length.
- **Look:** `src/components/` (browser frame, notes, intro, outro) and `src/theme.js`.

## Licence note

Remotion is free for individuals and companies with up to 3 employees; larger companies need a company licence
(https://www.remotion.dev/license).
