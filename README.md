# Fireteam

A co-op first-person shooter for the browser, built step by step as a game-development course. Each milestone adds a playable feature *and* a plain-English lesson explaining how it works.

**Play:** https://hartj77-blip.github.io/shooter-game-2/

**Now:** Milestone 1, the **Proving Ground**: a movement sandbox for walking, sprinting, crouching, sliding, jumping and climbing, with a live tuning panel to play with every number. There are no enemies or guns yet; those are the next milestones.

## Controls

| | |
|---|---|
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Sprint |
| Space | Jump, or climb a ledge in front of you |
| C | Crouch; slide if you're sprinting |
| `` ` `` (under Esc) | Tuning panel (pauses the game) |
| Esc | Pause |

Mouse sensitivity, field of view, hold-or-toggle for crouch and sprint, reduced camera motion and graphics quality are in **Settings**.

## Learn how it works

- [`docs/lessons/`](docs/lessons): one lesson per big idea, in order
  0. [How a browser game is put together](docs/lessons/00-how-a-browser-game-works.md)
  1. [The game loop](docs/lessons/01-the-game-loop.md)
  2. [3D space and vectors](docs/lessons/02-3d-space-and-vectors.md)
  3. [Movement that feels good](docs/lessons/03-movement.md)
  4. [Commands, events and state machines](docs/lessons/04-commands-events-and-states.md)
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md): every term in plain English
- [`docs/DESIGN.md`](docs/DESIGN.md): the game design document and roadmap

## Run it on your computer

Browsers won't load modules from a double-clicked file, so serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Add `?debug` to the address to open the tuning panel straight away.

## Tests

```sh
npm install        # once: installs Playwright, used only by the browser test
npm test           # unit tests: movement, levels, loop, input, settings (a few seconds)
npm run smoke      # opens the real game in a headless browser and walks around
```

GitHub runs both on every pull request (`.github/workflows/ci.yml`).

## Project layout

```
index.html        the page, the import map, menus and HUD
src/main.js       boots everything and runs the game flow
src/core/         game loop, input, events, settings, state machine, tuning panel
src/world/        physics (Rapier), the level kit, level building
src/player/       movement controller and first-person camera
src/render/       renderer, grid materials, level meshes, signs
src/ui/           HUD, menus, styles
levels/           maps, written as data
vendor/           pinned copies of three.js, Rapier and lil-gui
assets/           fonts (models and sounds later)
tests/            unit tests (Node) and the smoke test (Playwright)
docs/             design document, glossary, lessons
```

## Roadmap

| | Milestone | |
|---|---|---|
| ✅ | M0 Setup | repo, tests, CI, design doc |
| ✅ | M1 Move like a pro | movement, Proving Ground, tuning panel |
| ⏭ | M2 Gunfeel | rifle, recoil, aiming, effects, sound |
| | M3 Enemies | AI soldiers, pathfinding, cover |
| | M4 Co-op | 1–4 players, peer to peer, voice |
| | M5 Missions | objectives, the director, extraction |
| | M6 Art pass | stylized models, animation, lighting |
| | M7 Progression | XP, unlocks, loadouts |
| | M8 Polish | audio, HUD, settings, gamepad, touch |
| | M9 Content | maps, mission types, difficulty |

## Credits

Third-party libraries and fonts are listed with their licences in [CREDITS.md](CREDITS.md).
