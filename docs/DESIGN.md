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
| M2 | Gunfeel | Hitscan rifle, recoil, spread, aim down sights, viewmodel, effects, sound; then pistol, SMG, shotgun | Next |
| M3 | Enemies | Hit zones, AI soldiers with senses, state-machine brains, pathfinding, cover, flanking, ragdolls | |
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

## Controls

| Action | Mouse and keyboard |
|---|---|
| Move | W A S D |
| Look | Mouse |
| Sprint | Shift (hold or toggle) |
| Jump / climb | Space |
| Crouch / slide | C (hold or toggle) |
| Tuning panel | `` ` `` |
| Pause | Esc |

Gamepad and touch controls arrive in M8. Key rebinding arrives with full settings in M8.

## Art direction

- **Stylized military.** Chunky, simplified shapes; slightly exaggerated proportions; flat-ish colours with soft lighting. Think "toy soldier diorama", not "documentary".
- **Colour carries meaning.** Amber marks interactive things and the HUD's important bits. Red means danger. Friendly teams get a cool blue outline, enemies warm red.
- **Readability first.** Enemies must stand out from backgrounds at a distance. Shadows are soft, so they never hide a threat completely.
- **Grey-box until M6.** Gameplay is proven with the grid-textured kit before any real art goes in.

## Audio direction (from M2)

Punchy, slightly exaggerated weapon sounds; clear directional footsteps; distant gunfire with echo; music that rises with combat intensity. Everything important you hear also has a visual cue, for players who can't hear it.

## Accessibility (ongoing)

Already in: reduce camera motion, hold or toggle for crouch and sprint, adjustable field of view and sensitivity. Coming: key rebinding, colour-blind-safe markers, subtitles for important sounds, aim assist on gamepad and touch.

## Tech overview

- Plain JavaScript ES modules with an import map, with no build step.
- three.js for drawing, Rapier for physics, lil-gui for the tuning panel, all vendored in `vendor/` at pinned versions.
- PeerJS (WebRTC) for peer-to-peer co-op from M4: one player's browser hosts the game.
- Simulation runs at a fixed 60 Hz; drawing interpolates between ticks.
- Simulation code never touches the screen, so it's unit tested in Node.

## Open questions

- Should ADS (aim down sights) slow movement as much as in Call of Duty, or less? Decide in M2 playtesting.
- Friendly fire: off, on, or an option? Decide in M4.
- Do downed players bleed out, or wait indefinitely while a teammate lives? Decide in M5.
