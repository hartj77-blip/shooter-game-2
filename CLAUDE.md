# Fireteam: notes for Claude

This repo is a browser co-op FPS built as a **learning project**. The owner is learning game development as we go, so teaching is half the job.

## How to work here

- **Explain as you build.** Before each new concept, give a short plain-English explanation with an everyday comparison. No jargon without defining it. Friendly, never condescending.
- **Every milestone ships a lesson** in `docs/lessons/NN-topic.md` (idea in one sentence, analogy, where it lives in our code, a "Try this" experiment, common mistakes), and adds new terms to `docs/GLOSSARY.md`.
- Keep `docs/DESIGN.md` (milestone table, movement targets, open questions) and the README roadmap up to date.
- Real bugs make good lessons: when a fix teaches something, write the story into the lesson (see "A real bug" in lesson 3).

## Rules of the codebase

- **No build step.** Plain ES modules with the import map in `index.html`. Bare imports (`'three'`, `'@dimforge/rapier3d-compat'`, `'lil-gui'`) resolve through that map, in the browser and in tests (`tests/support/importmap-hooks.js` reads the same map).
- **Vendored, pinned libraries** in `vendor/`. Never load scripts from CDNs at runtime. Record versions and licences in `CREDITS.md`.
- **Simulation is separate from presentation.** `src/player/{controller,soldier}.js`, `src/world/*`, `src/weapons/*`, `src/game/*` and `src/core/{loop,input,events,fsm,settings,random}.js` must run in Node with no DOM or three.js renderer. Drawing, camera feel, HUD and sound only read simulation state.
- **Input becomes commands.** Simulation reads command objects, never the keyboard. Keep it deterministic (same commands give the same result; there's a test).
- **Data-driven tuning.** Feel-related numbers live in tuning tables (`DEFAULT_TUNING`, `DEFAULT_CAMERA_TUNING`) with sliders in `src/core/debug.js`. Levels are data in `levels/`.
- **Units:** metres, seconds, radians in code (degrees in UI). Y is up, north is -Z.
- **Comments explain why**, in plain English. Each file starts with a short header saying what it does and what it talks to.
- **One tick, in order** (see `src/main.js`): `soldier.move` → `targets.update` → `world.step()` → `soldier.act` (shots traced) → `course.update`. New colliders are only found by rays after a `world.step()`.
- **Events connect simulation to presentation** (`weapon:fire`, `bullet:impact`, `target:hit`, `course:*`...). Viewmodel, effects, audio and HUD listen; they never change the simulation.
- **Springs in presentation code must be sub-stepped** (small fixed steps per frame). One big step on a slow frame explodes them; lesson 6 tells the story.
- **Assets must be CC0** (or similarly free) and credited in `CREDITS.md`. Check the licence on each source page before downloading. Sounds are rebuilt with `tools/build-sounds.py`; every sound needs a synthesized fallback.

## Checks before pushing

```sh
npm test         # unit tests (Node, a few seconds)
npm run smoke    # headless browser test (needs `npm install` once)
```

Add a regression test for every movement or simulation bug fixed. In this container the preinstalled Chromium matches `@playwright/test` 1.56.1; CI installs its own.

## Deploy

GitHub Pages serves `main` from the repo root. `.nojekyll` is there so every file is served as-is.
