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
- **The app shell and missions.** `src/main.js` lives as long as the page (renderer, sound, input, settings, menus). `src/mission.js` builds one map (its own event bus, the session, everything it draws under one `root` group) and `dispose()` tears it all down, so changing map never reloads the page. Anything a mission adds to the page or scene must be removed in its `dispose()`/`destroy()`.
- **Simulation is separate from presentation.** `src/player/{controller,soldier,hitboxes,health}.js`, `src/world/*`, `src/weapons/*`, `src/ai/*`, `src/game/*`, `src/net/*` (except `voice.js` and `peer-loader.js`, which are browser-only) and `src/core/{loop,input,events,fsm,settings,random}.js` must run in Node with no DOM or three.js renderer. Drawing, camera feel, HUD and sound only read simulation state. Ragdolls are presentation: they live in their own physics world (`src/render/ragdolls.js`) and never touch the real one.
- **Input becomes commands.** Simulation reads command objects, never the keyboard. Keep it deterministic (same commands give the same result; there's a test).
- **Data-driven tuning.** Feel-related numbers live in tuning tables (`DEFAULT_TUNING`, `DEFAULT_CAMERA_TUNING`, `WEAPONS`, `ROLES`, `AWARENESS`, `NOISE`, `DIFFICULTY`) with sliders in `src/core/debug.js`. Levels are data in `levels/`.
- **Units:** metres, seconds, radians in code (degrees in UI). Y is up, north is -Z.
- **Comments explain why**, in plain English. Each file starts with a short header saying what it does and what it talks to.
- **One tick, in order** (`tick()` in `src/game/sim.js`, shared by solo play, the co-op host and the tests; every player's step runs before the enemies'): `soldier.move` → `enemies.move` → `targets.update` → `world.step()` → `soldier.act` (your shots traced) → `enemies.playerShots` → `enemies.think` (senses, brains, routes) → `enemies.act` (their shots) → `health.update` → `course.update` / `encounter.update`. New or moved colliders (targets, hitboxes) are only found by rays after a `world.step()`.
- **Every physics query passes a collision group** from `src/world/groups.js`: `MOVE` for walking and body checks, `BULLET` for shots, `SIGHT` for eyesight, `LEVEL` for mapping and ledges (nobody climbs onto a person). Any new collider that isn't level geometry needs its own group (characters are `CHARACTER_GROUPS`, hitboxes `HITBOX_GROUPS`).
- **Events connect simulation to presentation** (`weapon:fire`, `bullet:impact`, `target:hit`, `player:hurt`, `bullet:nearmiss`, `enemy:down`, `enemy:bark`, `course:*`, `encounter:*`...). Viewmodel, effects, audio and HUD listen; they never change the simulation. Every soldier event carries `owner` (a player slot 0–3, or `e3` = enemy 3): listeners for *your* feedback (camera, viewmodel, hit markers) must compare it with the local player's slot (`owner`/`me` options), which is not always 0 in co-op.
- **Enemies are soldiers driven by brains.** `src/ai/brain.js` decides intent; `src/ai/enemy.js` turns intent into the same commands the keyboard makes. Role differences are numbers in `ROLES` (`src/ai/enemy-data.js`), not code. Keep the fairness rules (reaction time, settling aim, warning shots, attack tokens, telegraphs) when adding enemy types.
- **Levels with enemies** set `nav: { min, max }` (the area to map) and use `enemy` pieces. Stairs enemies should climb need steps (`run`) at least 0.35 m deep. The Compound's tests check every enemy spot is reachable and nobody can see the spawn: do the same for new maps.
- **Springs in presentation code must be sub-stepped** (small fixed steps per frame). One big step on a slow frame explodes them; lesson 6 tells the story.
- **Assets must be CC0** (or similarly free) and credited in `CREDITS.md`. Check the licence on each source page before downloading. Sounds are rebuilt with `tools/build-sounds.py`; every sound needs a synthesized fallback.

## Co-op (milestone 4)

- **The host is the referee** (`src/net/host.js` over `src/game/sim.js`); solo play is a host session for one. Clients (`src/net/client.js`) predict their own soldier and draw everyone else from snapshots via stand-ins (`src/net/proxies.js`). Lessons 11–13.
- **Same rules on both computers.** Anything that changes how a command plays out (downed players stand still, holding F blocks the gun) must be decidable from the command and state the client also has, or prediction will disagree with the host. Stand-ins must have the same shapes as the real thing (`bodyCollider()`). Commands are rounded (`roundCommand`) before the client predicts with them.
- **Events that should reach clients** go in `SHARED_EVENTS` in `src/net/protocol.js` (with `eventFor` deciding who gets what). Only plain data crosses the wire (`wireEvent`). Every message format is documented in `protocol.js` or `room.js`.
- **Presentation reads `view` summaries** (`viewOf` in `src/ai/enemy.js`, `playerView` in `src/game/sim.js`, proxies' `view`), never enemy or player internals, so host and clients draw the same way.
- **Tests:** `tests/support/coop.js` runs a host and clients over a pretend network (`createLoopbackNet`: delay, jitter, loss). `tests/smoke/coop.spec.js` plays two tabs over `BroadcastChannel` (`?net=local&nolock`) with Chromium's pretend microphone. Keep the "perfect network, nobody touching: zero corrections" test passing: it catches client/host disagreements.

## Checks before pushing

```sh
npm test         # unit tests (Node, a few seconds)
npm run smoke    # headless browser test (needs `npm install` once)
```

Add a regression test for every movement or simulation bug fixed. In this container the preinstalled Chromium matches `@playwright/test` 1.56.1; CI installs its own.

## Deploy

GitHub Pages serves `main` from the repo root. `.nojekyll` is there so every file is served as-is.
