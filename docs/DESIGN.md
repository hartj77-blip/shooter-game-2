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
| M3 | Enemies | Enemy soldiers (Rifleman, Rusher, Marksman) with sight, hearing and awareness, state-machine brains, squads, a nav grid with A*, cover and flanking, fairness rules, ragdolls, health that recovers, the Compound map, difficulty | **Done** |
| M4 | Co-op | 1–4 players: lobby, room codes, invite links, host-run game, snapshots, interpolation, prediction and reconciliation, favour-the-shooter hits, bleed out and revive, spectating, pings, squad HUD, voice (radio + nearby), a mission loader | **Done** |
| M5 | Missions | Objectives, the director, reinforcements, success and fail, debrief | Next |
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

## Enemies (M3)

The numbers live in `src/ai/enemy-data.js` (and the tuning panel's AI section). One brain runs every role; only the numbers differ.

| Role | Gun | Health | Sees | Reaction | Aim error (start → settled) | Likes to fight at | Style |
|---|---|---|---|---|---|---|---|
| Rifleman | K4 Carbine | 100 | 60 m, 120° | 0.45 s | 4.5° → 1.1° over 1.6 s | 22 m | Cover, peek, bursts of 3–6, sometimes flanks |
| Rusher | Vanta SMG | 90 | 45 m, 130° | 0.35 s | 6° → 2.2° over 1.1 s | 7 m | Sprints, charges, flanks, fires on the move |
| Marksman | R7 Marksman Rifle (enemy only) | 80 | 95 m, 90° | 0.6 s | 3° → 0.3° over 2.2 s | 45 m | Holds a perch; laser on you for 1.1 s before each heavy shot (70 damage before difficulty) |

**Fairness rules:** reaction time, aim that settles only while they keep you in sight, a short tracking delay (so moving helps), a warning burst over your head first, attack tokens (only N may shoot at you at once), the Marksman's laser and tone, and callouts as subtitles. Squads share your last known position, never your real one.

**Difficulty** (Settings):

| | Enemy damage | Reactions | Aim error | Shooting at once | Noticing you |
|---|---|---|---|---|---|
| Recruit | 30% | ×1.35 | ×1.4 | 1 (+ a Marksman) | ×0.75 |
| Regular | 45% | ×1 | ×1 | 2 (+ a Marksman) | ×1 |
| Veteran | 70% | ×0.75 | ×0.75 | 3 (+ a Marksman) | ×1.3 |

Measured on Regular, standing in the open at the Compound gate: down after 4.9 s (2.1 s after the first hit); strafing, 10.9 s. Recruit about twice as long, Veteran 2.5 s.

**Your health:** 100. Recovery starts 4.5 s after the last hit, at 22 per second. At 0 you're down; solo, R restarts the fight (co-op: see below). Enemies get no headshot bonus on you.

**The Compound:** a walled compound about 72 × 60 m inside the wall. It has a two-storey house with a balcony, a warehouse, barracks, a guard tower and a courtyard of containers and sandbags. You start behind a berm where nobody can see you (a test checks this). There are three ways in: the gate, a breach in the east wall, and a drain in the west wall that only you can crawl through. 16 enemies in 6 squads; clear them all for a time and a results card. Best time is saved in the browser.

## Co-op (M4)

Up to 4 players. One browser hosts (runs the real game); the others are clients. Lessons 11–13 explain how.

| Thing | Value | Where |
|---|---|---|
| Snapshots | 20 a second (every 3rd tick), unreliable; about 1.4 KB for 4 players and 16 enemies (budget 2.5 KB) | `SNAPSHOT_EVERY`, `SNAPSHOT_BUDGET` in `src/net/protocol.js` |
| Commands | 60 a second, each packet repeating the last 3, unreliable | `CMD_REDUNDANCY` |
| Others drawn in the past by | 6 ticks (0.1 s) | `INTERP_DELAY` |
| Host's command cushion | about 2 commands; 2 per tick when more than 8 wait | `src/net/jitter.js` |
| Prediction "match" | within 1 cm; corrections glide out over about 0.1 s | `MATCH` in `src/net/client.js` |
| Hit claims | start within 3.5 m of where the host has you; capped at the gun's maximum | `src/net/host.js` |
| Friendly fire | off | `passThrough` |
| Bleed out / revive | 30 s to be revived; hold F for 3 s within 1.8 m; back up on 30 health | `DEFAULT_HEALTH`, `REVIVE` |
| Enemy health by squad size | ×1, ×1.25, ×1.45, ×1.6 | `PLAYER_SCALING` in `src/ai/enemy-data.js` |
| Attack tokens | per player (each player gets the difficulty's number) | `src/ai/squad.js` |
| Pings | marker for 4 s; an enemy ping follows the enemy | `PING` in `src/game/pings.js` |
| Nearby voice | full volume within 4 m, silent at 25 m | `VOICE` in `src/net/voice-mix.js` |
| Radio voice | band-pass 300–3,400 Hz plus soft distortion | `src/net/voice.js` |
| Room codes | 5 letters, no I, L or O | `src/net/room.js` |

Measured: the host's tick with 4 players, 16 enemies and 3 clients takes about 1.8 ms (99% under 6.6 ms); a client's tick about 0.5 ms. Co-op best times are kept per squad size. The kill house timer is solo only; co-op on the Proving Ground is free roam.

If the host leaves, the game ends for everyone ("The host left the game.").

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
| Squad radio (co-op) | V (hold) |
| Ping (co-op) | Z or middle mouse |
| Revive a teammate (co-op) | F (hold) |
| Spectating: next teammate | Left mouse |
| Tuning panel | `` ` `` |
| Pause | Esc |

When you're down in a solo fight, R starts it again. In co-op the host presses R once the whole squad is down. Gamepad and touch controls arrive in M8. Key rebinding arrives with full settings in M8.

## Art direction

- **Stylized military.** Chunky, simplified shapes; slightly exaggerated proportions; flat-ish colours with soft lighting. Think "toy soldier diorama", not "documentary".
- **Colour carries meaning.** Amber marks interactive things and the HUD's important bits. Red means danger. Teammates wear cool blue accents, enemies warm red; each player slot has its own colour (amber, blue, green, pink) in the roster and on name tags.
- **Readability first.** Enemies must stand out from backgrounds at a distance. Shadows are soft, so they never hide a threat completely.
- **Grey-box until M6.** Gameplay is proven with the grid-textured kit before any real art goes in.

## Audio direction

Punchy weapon sounds from real CC0 recordings, with a short echo; every play slightly varied in pitch so automatic fire never sounds robotic; positional impacts; footsteps that change with the surface. Since M3: enemy gunfire and footsteps placed in 3D and duller with distance (far sounds lose their treble), bullet whizzes past your ear, a heartbeat at low health, a radio click with every callout, and a tone with the Marksman's laser. Since M4: voice chat (squad radio through a radio filter, nearby voice placed in 3D), teammates' footsteps and gunfire, a handset click when someone keys the radio. Still to come: recorded voices for callouts, music that rises with combat intensity.

## Accessibility (ongoing)

Already in: pings and markers so a squad can play without voice, push-to-talk or voice off, per-player mute, reduce camera motion, hold or toggle for crouch, sprint and aiming, adjustable field of view and sensitivity, difficulty levels, subtitles for enemy callouts, and an on-screen arrow for every threat you might only hear (damage direction, someone noticing you, a laser on you). Coming: key rebinding, colour-blind-safe markers, aim assist on gamepad and touch.

## Tech overview

- Plain JavaScript ES modules with an import map, with no build step.
- three.js for drawing, Rapier for physics, lil-gui for the tuning panel, all vendored in `vendor/` at pinned versions.
- PeerJS 1.5.5 (WebRTC) for peer-to-peer co-op: one player's browser hosts the game; voice is a mesh. Its free broker introduces players; its free TURN servers relay when a network blocks direct links.
- Simulation runs at a fixed 60 Hz; drawing interpolates between ticks.
- Simulation code never touches the screen, so it's unit tested in Node.

## Open questions

- ~~How much should aiming slow you down?~~ Decided in M2: to 60–75% of normal speed depending on the gun (`ads.move`), and you can't sprint while aiming.
- Should guns have a limited spare-ammo pool in missions, with ammo crates? The training ground uses infinite spare magazines for now. Decide in M5.
- ~~Friendly fire: off, on, or an option?~~ Decided in M4: off.
- ~~Do downed players bleed out?~~ Decided in M4: yes, after 30 s, unless a teammate revives them; then you spectate until the next fight.
- When the host leaves, hand the game to another player ("host migration") instead of ending it? Possible, because every client has the level; the hard part is moving the enemies' brains. Later.
- Some strict networks can't connect even through the free relay. A paid TURN service, or our own? Decide if players hit it.
- Hits are trusted to each player's browser (favour the shooter). Fine for friends; a public matchmaking mode would need the host to check shots properly (lag compensation).
- Should enemies vault low walls and drop off ledges? The nav grid has no "jump links" yet, so they walk round. Decide when a map needs it.
- Grenades (yours and theirs) to flush enemies out of cover? Probably M7 (loadouts) or M5 (missions).
- When you go down in a solo mission: restart the whole fight (as now), or a checkpoint? Decide in M5.
