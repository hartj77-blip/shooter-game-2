# Lesson 0: How a browser game is put together

**The idea in one sentence:** a browser game is just a web page whose JavaScript draws a new picture about 60 times a second, and GitHub Pages hands those files to anyone who visits.

## The everyday version

Think of a flip-book. The web page is the book, JavaScript is the person drawing each page, and the browser flips through them so fast it looks like motion. Hosting the files on GitHub Pages is like leaving the book on a shelf in a public library: anyone with the address can pick it up and read it.

## What's in this repo

| Folder or file | What it is |
|---|---|
| `index.html` | The page. It has the `<canvas>` the 3D world is drawn on, the HTML for the menus and HUD, and the *import map* (below). |
| `src/` | Our JavaScript, split into one file per job: `core/` (the engine bits), `world/` (physics and levels), `player/`, `render/`, `ui/`. |
| `levels/` | Maps, written as data. |
| `vendor/` | Other people's libraries that we keep our own pinned copy of: three.js (3D drawing), Rapier (physics), lil-gui (the tuning panel). |
| `assets/` | Fonts now; models, sounds and textures later. |
| `tests/` | Automatic checks (see below). |
| `docs/` | The design document, the glossary and these lessons. |

## Modules and the import map

Our holdout game was one huge file. This one is split into **modules**: small files that each do one job and say which other files they need, like this line from `src/player/camera.js`:

```js
import * as THREE from 'three';
import { events } from '../core/events.js';
```

The browser can't know what `'three'` means on its own. The **import map** in `index.html` tells it: "`three` means `./vendor/three/three.module.js`". That's all a build tool would have done for us, so we don't need one. The files in the repo are exactly what the browser runs.

**Why pin and keep our own copy (`vendor/`)?** If we loaded three.js from someone else's website and they changed or removed it, our game would break overnight. With our own copy, nothing changes unless we change it.

## Tests and CI

- **Unit tests** (`tests/unit/`) check one piece of logic at a time with no browser. For example: "a jump reaches 1.05 m" or "a 0.5 m step blocks walking". Run them with `npm test`. They all run in a few seconds.
- **The smoke test** (`tests/smoke/`) opens the real game in a real (invisible) browser, holds W, and checks the player walked forward with no errors. Run it with `npm run smoke`.
- **CI** (continuous integration, in `.github/workflows/ci.yml`) makes GitHub run both on every pull request. You get a green tick or a red cross before anything is merged.

Professional teams lean on this hard: a computer re-checks everything after every change, so a fix in one place can't quietly break something somewhere else.

## Try this

1. Open the game, then open your browser's developer tools (F12, or Cmd+Option+I on a Mac) and click the **Console** tab.
2. Type `fireteam.player.tuning.gravity = 5` and press Enter.
3. Click back into the game and jump. You're on the Moon. Reload the page to undo it.

That `fireteam` object is a handle `src/main.js` leaves on purpose so you can poke at the live game.

## Common mistakes

- **Opening `index.html` by double-clicking it.** Browsers refuse to load modules from `file://` addresses. Use a tiny local web server instead: `python3 -m http.server 8000`, then visit `http://localhost:8000`.
- **Expecting a change to show up instantly on GitHub Pages.** After a merge, Pages takes a minute or two to update. Hard-refresh (Ctrl+Shift+R) to skip the browser's cache.
