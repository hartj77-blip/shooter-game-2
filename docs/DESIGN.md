# Fireteam: game design document

A design document is the blueprint every studio writes before (and while) building a game. It says what the game is, who it's for, and what "done" looks like, so every decision can be checked against it. It's a living document: we update it as we learn.

## The pitch

You and up to three friends are a special-forces fireteam. From a lobby you pick a mission (raid a compound, rescue a hostage, steal intel, hold a position) and drop into a hand-built map. A pacing system called the *director* sends enemy soldiers at you. When the objectives are done, you call the helicopter and survive until it lands. Back in the lobby you earn XP and unlock weapons, attachments and gear for the next mission.

- **Camera:** first-person, 3D
- **Players:** 1 to 4, co-op, in the browser, no install
- **Look:** stylized military: clean, chunky low-poly shapes and bold readable colours, not photo-real
- **Enemy:** a fictional private military company

## Pillars

Every feature should serve at least one of these. If it serves none, we don't build it.

1. **Feels great in the hands.** Movement and gunplay are responsive, readable and satisfying before anything else.
2. **Better together.** Missions are designed for teamwork: covering, reviving, pinging targets, splitting objectives.
3. **Clear at a glance.** You always know where to go, what's dangerous, and what just hit you.
4. **Runs anywhere.** A mid-range laptop browser holds 60 fps on the default settings.

## The core loop

> pick mission → choose loadout → fight → complete objectives → extract → earn rewards → upgrade → repeat

The moment-to-moment loop inside a mission: *move → spot → shoot → take cover → reposition*.

## Milestones

Each milestone ends with something playable on GitHub Pages, a lesson in `docs/lessons/`, and a merged pull request with green CI.

| # | Name | What it adds | Status |
|---|---|---|---|
| M0 | Setup | Repo structure, pinned libraries, tests, CI, this document | **Done** |
| M1 | Move like a pro | Fixed-timestep loop, mouse look, walk/sprint/crouch/jump/slide/mantle, the Proving Ground, tuning panel | **Done** |
| M2 | Gunfeel | Four guns (carbine, SMG, pump shotgun, pistol), recoil, spread, aim down sights, viewmodel, effects, real sound, firing range, timed kill house | **Done** |
| M3 | Enemies | AI soldiers with senses, state-machine brains, pathfinding, cover, flanking, ragdolls (hit zones already exist on targets) | Next |
| M4 | Co-op | Lobby, room codes, host-run game, snapshots, interpolation, prediction, revive, pings, voice | |
| M5 | Missions | Objectives, the director, reinforcements, success and fail, debrief | |
| M6 | Art pass | Stylized kit, animated characters, lighting, post-processing, quality presets | |
| M7 | Progression | XP, unlocks, attachments, loadouts, support call-ins, saved progress | |
| M8 | Polish | Audio mix, HUD, full settings, gamepad, touch, loading, performance | |
| M9 | Content | Three or more maps, five mission types, modifiers, difficulty, release | |

## Movement targets (M1)

These are the defaults in `DEFAULT_TUNING` (`src/player/controller.js`). Tests check the important ones.

| Thing | Value | Why |
|---|---|---|
| Walk / sprint / crouch speed | 5.0 / 7.5 / 2.6 m/s | In the range of modern military shooters |
| Time to full speed | about 0.15 s | Snappy, not twitchy |
| Stop from walking | under 0.35 s | Precise peeking around corners later |
| Jump height | 1.05 m | Clears waist-high cover; can't hop onto rooftops |
| Gravity | 20 m/s² | Short, punchy jumps |
| Step height | 0.35 m | Stairs and kerbs never interrupt you |
| Steepest walkable slope | 46° | |
| Mantle reach | 1.35 m (about 2.3 m with a jump) | Windows and walls become routes |
| Slide | +2 m/s boost, steady slow-down, speeds up downhill | A fast, flashy way to reach cover |
| Coyote time / jump buffer | 0.12 s / 0.15 s | Forgiveness players feel but never see |

## Weapons (M2)

The numbers live in `src/weapons/weapons-data.js`; tests check fire rates, reload times and damage against them.

| Slot | Gun | Fires | Rate | Damage near → far | Mag | Reload (part / empty) | Aim zoom | Role |
|---|---|---|---|---|---|---|---|---|
| 1 | K4 Carbine | auto | 750/min | 30 → 22 (25–60 m) | 30 | 1.9 / 2.35 s | 1.35× | All-rounder, red dot |
| 2 | Vanta SMG | auto | 900/min | 24 → 15 (12–30 m) | 32 | 1.6 / 2.0 s | 1.25× | Close range, fast handling |
| 3 | Breacher 12 | pump | 70/min | 8 × 14 → 4 (6–20 m) | 6 | shell by shell | 1.15× | Room clearing |
| 4 | P9 Sidearm | semi | per click | 26 → 18 (15–40 m) | 15 | 1.45 / 1.7 s | 1.2× | Fastest swap |

Hit zones: head ×2 (shotgun ×1.5), body ×1, limbs ×0.75. Bullets punch through thin wood (not crates, concrete or steel). Spread is seeded, so every computer agrees where bullets go.

**Kill house:** 10 hostile pop-ups and 3 hostages across four rooms. The timer starts when you step off the green pad and stops on the amber pad once every hostile is down. Each hostage hit adds 5 s. Best time is saved in the browser.

## Controls

| Action | Mouse and keyboard |
|---|---|
| Move | W A S D |
| Look | Mouse |
| Sprint | Shift (hold or toggle) |
| Jump / climb | Space |
| Crouch / slide | C (hold or toggle) |
| Fire | Left mouse |
| Aim down sights | Right mouse (hold or toggle) |
| Reload | R |
| Switch gun | 1–4, mouse wheel, Q for the last gun |
| Tuning panel | `` ` `` |
| Pause | Esc |

Gamepad and touch controls arrive in M8. Key rebinding arrives with full settings in M8.

## Art direction

- **Stylized military.** Chunky, simplified shapes; slightly exaggerated proportions; flat-ish colours with soft lighting. Think "toy soldier diorama", not "documentary".
- **Colour carries meaning.** Amber marks interactive things and the HUD's important bits. Red means danger. Friendly teams get a cool blue outline, enemies warm red.
- **Readability first.** Enemies must stand out from backgrounds at a distance. Shadows are soft, so they never hide a threat completely.
- **Grey-box until M6.** Gameplay is proven with the grid-textured kit before any real art goes in.

## Audio direction

Punchy weapon sounds from real CC0 recordings, with a short echo; every play slightly varied in pitch so automatic fire never sounds robotic; positional impacts; footsteps that change with the surface. Still to come: distant gunfire for other players' guns, music that rises with combat intensity, and a visual cue for every important sound for players who can't hear it.

## Accessibility (ongoing)

Already in: reduce camera motion, hold or toggle for crouch and sprint, adjustable field of view and sensitivity. Coming: key rebinding, colour-blind-safe markers, subtitles for important sounds, aim assist on gamepad and touch.

## Tech overview

- Plain JavaScript ES modules with an import map, with no build step.
- three.js for drawing, Rapier for physics, lil-gui for the tuning panel, all vendored in `vendor/` at pinned versions.
- PeerJS (WebRTC) for peer-to-peer co-op from M4: one player's browser hosts the game.
- Simulation runs at a fixed 60 Hz; drawing interpolates between ticks.
- Simulation code never touches the screen, so it's unit tested in Node.

## Open questions

- ~~How much should aiming slow you down?~~ Decided in M2: to 60–75% of normal speed depending on the gun (`ads.move`), and you can't sprint while aiming.
- Should guns have a limited spare-ammo pool in missions, with ammo crates? The training ground uses infinite spare magazines for now. Decide in M5.
- Friendly fire: off, on, or an option? Decide in M4.
- Do downed players bleed out, or wait indefinitely while a teammate lives? Decide in M5.
