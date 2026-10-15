# Fireteam

A co-op first-person shooter for the browser, built step by step as a game-development course. Each milestone adds a playable feature *and* a plain-English lesson explaining how it works.

**Play:** https://hartj77-blip.github.io/shooter-game-2/

**Now:** Milestone 3, **Enemies**. Pick a map on the title screen:

- **The Compound:** clear a walled compound held by 16 enemy soldiers. Riflemen take cover and peek, Rushers charge and flank, and Marksmen warn you with a laser before each shot. They see and hear you, call out to each other, and search where they last saw you. Health recovers if you get out of the fire.
- **The Proving Ground:** the practice area from milestones 1 and 2: the movement course, four guns, the firing range and the timed kill house.

Every number (movement, guns, enemies) has a slider in the live tuning panel.

## Controls

| | |
|---|---|
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Sprint |
| Space | Jump, or climb a ledge in front of you |
| C | Crouch; slide if you're sprinting |
| Left mouse | Fire |
| Right mouse | Aim down the sights |
| R | Reload |
| 1–4, mouse wheel, Q | Switch gun; Q swaps back to the last one |
| R (when you're down) | Try the fight again |
| `` ` `` (under Esc) | Tuning panel (pauses the game) |
| Esc | Pause |

Difficulty (Recruit, Regular, Veteran), mouse and aiming sensitivity, field of view, hold-or-toggle for crouch, sprint and aiming, volume, reduced camera motion and graphics quality are in **Settings**.

## Learn how it works

- [`docs/lessons/`](docs/lessons): one lesson per big idea, in order
  0. [How a browser game is put together](docs/lessons/00-how-a-browser-game-works.md)
  1. [The game loop](docs/lessons/01-the-game-loop.md)
  2. [3D space and vectors](docs/lessons/02-3d-space-and-vectors.md)
  3. [Movement that feels good](docs/lessons/03-movement.md)
  4. [Commands, events and state machines](docs/lessons/04-commands-events-and-states.md)
  5. [How shooting works](docs/lessons/05-how-shooting-works.md)
  6. [Game feel ("juice")](docs/lessons/06-game-feel.md)
  7. [Sound](docs/lessons/07-sound.md)
  8. [How enemies think](docs/lessons/08-how-enemies-think.md)
  9. [Pathfinding and cover](docs/lessons/09-pathfinding-and-cover.md)
  10. [Health, hits and bodies](docs/lessons/10-health-hits-and-bodies.md)
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md): every term in plain English
- [`docs/DESIGN.md`](docs/DESIGN.md): the game design document and roadmap

## Run it on your computer

Browsers won't load modules from a double-clicked file, so serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Add `?debug` to the address to open the tuning panel straight away, and `?map=compound` to go straight to the Compound.

## Tests

```sh
npm install        # once: installs Playwright, used only by the browser test
npm test           # unit tests: movement, weapons, hitscan, targets, kill house, enemy AI, pathfinding, the Compound...
npm run smoke      # opens the real game in a headless browser: walks, shoots, runs the kill house, fights in the Compound
```

GitHub runs both on every pull request (`.github/workflows/ci.yml`).

## Project layout

```
index.html        the page, the import map, menus and HUD
src/main.js       the app shell: boots everything and runs the game flow
src/mission.js    one map, built and torn down without a page reload
src/core/         game loop, input, events, settings, state machine, seeded random, tuning panel
src/world/        physics (Rapier), collision groups, the level kit, level building, surfaces, targets
src/weapons/      the weapon table, guns, the arsenal, hitscan
src/player/       movement controller, soldier (movement + guns + hitboxes), health, first-person camera
src/ai/           enemies: roles, senses, brains, squads, the nav grid, A*, cover, noise
src/game/         the kill house course, the Compound's rules
src/render/       renderer, materials, level meshes, signs, guns, viewmodel, effects, targets,
                  block soldiers, ragdolls, AI debug views
src/audio/        sound engine, sound bank, game sounds
src/ui/           HUD, menus, styles
levels/           maps, written as data
vendor/           pinned copies of three.js, Rapier and lil-gui
assets/           fonts and sounds
tools/            build-sounds.py (cuts the CC0 recordings into game sounds)
tests/            unit tests (Node) and the smoke test (Playwright)
docs/             design document, glossary, lessons
```

## Roadmap

| | Milestone | |
|---|---|---|
| ✅ | M0 Setup | repo, tests, CI, design doc |
| ✅ | M1 Move like a pro | movement, Proving Ground, tuning panel |
| ✅ | M2 Gunfeel | four guns, recoil, aiming, effects, sound, range, kill house |
| ✅ | M3 Enemies | AI soldiers, senses, squads, pathfinding, cover, ragdolls, the Compound |
| ⏭ | M4 Co-op | 1–4 players, peer to peer, voice |
| | M5 Missions | objectives, the director, extraction |
| | M6 Art pass | stylized models, animation, lighting |
| | M7 Progression | XP, unlocks, loadouts |
| | M8 Polish | audio, HUD, settings, gamepad, touch |
| | M9 Content | maps, mission types, difficulty |

## Credits

Third-party libraries, fonts and sounds are listed with their licences in [CREDITS.md](CREDITS.md).
