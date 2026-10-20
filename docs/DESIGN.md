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
| M5 | Missions | The Harbour map, four missions (rescue, intel, sabotage, hold the line) with extraction by helicopter, the director and reinforcements, checkpoints and retry, limited ammo and crates, grenades, the hostage, explosions, the debrief | **Done** |
| M6 | Art pass | Animated soldiers on real skeletons, real gun models, textured world with trims and props, a mood per map, post-processing and quality presets, night missions where darkness hides you, night vision; controller support (pulled forward from M8) | **Done** |
| M7 | Progression | XP, ranks and gun levels, unlocks, nine attachments, the Loadout screen, four call-ins (supply drop, recon drone, mortar, smoke), saved progress with backup codes | **Done** |
| M8 | Polish | Key rebinding, HUD size and hide, subtitles switch, interface volume, automatic graphics quality, touch controls | **Done** |
| M9 | Content | A fifth mission type (eliminate: Kingpin), mission modifiers (Iron man, Scarce supplies, Lethal), version 1.0 | **Done** |

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

## Missions (M5)

Missions are data (`levels/missions.js`); objectives, checkpoints and results are in `src/game/operation.js` and `src/game/objectives.js`; the director is `src/game/director.js`. Lessons 14–17 explain how.

| Mission | Job | Then |
|---|---|---|
| **Lifeline** (rescue) | The hostage is in one of three village buildings. Hold F for 2 s to free them; they follow you | Extract with them from the car park LZ (60 s inbound) |
| **Dead Drop** (intel) | The laptop is in one of three rooms. Hold F to start a 60 s download; it stalls while enemies are within 7 m and none of you within 12 m. Take the drive | Extract with whoever carries it (it drops where its carrier bleeds out) |
| **Short Fuse** (sabotage) | Three caches among five possible spots. Hold F for 4 s to plant a charge; 10 s later it blows (11 m, 420 damage) | Extract from the car park LZ |
| **Last Light** (hold the line) | Switch on the lighthouse radio, then hold the headland for 3 minutes; progress pauses while an enemy is inside (8 m) | The helicopter lands on the headland 20 s later |

Every mission ends with **extraction**: call the helicopter at the LZ's radio, survive the crescendo, board (within 4.5 m of the pad's middle). It leaves when everyone standing is aboard, with the hostage or the drive if that's the job, and nobody bleeding out.

| Thing | Value | Where |
|---|---|---|
| The director | Calm 35–45 s; then a wave every 30–48 s of 3/4/5/6 enemies (1–4 players); peak at squad intensity 0.72, then a 20–32 s breather; crescendo: a wave every 14 s | `DIRECTOR`, `levels/missions.js` |
| Enemies standing at most | 16 / 18 / 21 / 24 (1–4 players), garrison included | `maxAlive` |
| Fair spawns | At entry points nobody standing can see, at least 35 m from everyone | `director.js` |
| Spare ammo | Real in missions, infinite on practice maps | `infiniteAmmo` in `src/game/sim.js` |
| Ammo crates | Hold F for 1 s: spares full and both grenades back. 4 refills per crate, shared; 7 on the Harbour | `SUPPLY`, `crate` pieces |
| Grenades | 2 per mission (G). 3.2 s fuse, 7 m radius, full damage within 1.5 m, 160 damage; walls block; never hurt the squad | `GRENADE` |
| Checkpoints | After each step. Retry (R, the host in co-op) keeps guards you dealt with gone, sends reinforcements away, restores ammo and crate refills; bled-out teammates return at the next checkpoint | `operation.js` |
| The hostage | Follows 3.2 m behind, sprints beyond 8 m, waits beyond 28 m; enemy bullets do half damage, yours pass through; 45 s to revive | `HOSTAGE` |
| Hold to interact | 1.6 m along the ground, 1.5 m up or down; reviving comes first | `INTERACT` |

**The Harbour** (`levels/harbour.js`): about 170 × 125 m; a fishing village (west), a container yard and car park (centre), warehouses and the harbour office (east), the quay, jetty and lighthouse (north). 16 enemies in squads, 5 entry points, 2 landing zones, 12 objective sites. Landmarks: the cranes, the lighthouse, the chapel's red roof, the white office. Tests check every enemy, site, crate and LZ can be reached from the start, every entry route can be walked, the hostage can walk from each site to the helicopter, and nobody can see where you arrive.

Measured: the Harbour builds and maps (130,000 walkable cells) in 0.9 s in Node, and loads in the browser in about 3 s. The host's tick with 4 players, 24 enemies and the hostage takes 1.75 ms on average (99% under 8.4 ms). A 4-player snapshot at the cap is about 1.8 KB (budget 2.5 KB). Batching the level per material in 32 m tiles takes a Harbour frame from 365 draw calls to 200 on low quality.

## Art pass (M6)

Lessons 18–22 explain how. Everything here is presentation, except the night's light levels (`src/world/lighting.js`), which the enemies use.

| Thing | What | Where |
|---|---|---|
| Soldiers | Quaternius' mannequin (CC0), 10 clips blended by speed; legs from clips, spine and arms from code with two-bone IK; gear built in code on the bones; ragdolls on the skeleton; outlines; a quarter-detail body past 20 m | `render/character.js`, `tools/build-models.mjs` |
| Guns | Five CC0 models, repainted as vertex colours (one draw call each); magazine, pump and slide still move; points measured in `GUN_MODELS`; a code-built red dot on the carbine | `render/gun-models.js` |
| World | Nine Poly Haven (CC0) surfaces as grey detail plus normal maps, painted in the palette's colours, a faint line every metre; trims (decor) on walls, doors and windows; barrels, pallets, lamp posts and a fuel tank; solid mission props at every site | `render/materials.js`, `tools/build-textures.py`, `world/kit.js` |
| Moods | Midday (Proving Ground), haze (Compound), golden hour (Harbour), night | `render/moods.js` |
| Quality | Low: straight to the screen. Medium: colour grade, outlines, 4× MSAA, shadows 1024. High: + ambient occlusion, bloom, shadows 2048, pixel ratio 2 | `QUALITY` in `render/renderer.js`, `render/post.js` |
| Night | Every Harbour mission also at night. Moonlight 0.15, lamps, your muzzle flash, enemy torches (22 m, 14° either side); in full dark enemies see 35% as far and notice 30% as fast | `LIGHTING` |
| Night vision | N or D-pad down; your screen only, even on low | `render/post.js` |
| Controllers | Standard layout; dead zone 0.15, squared response, turn boost; aim assist slows turning to 45% over a visible enemy; rumble; menus by D-pad | `core/gamepad.js` |

Measured: the Harbour draws in 204 / 292 / 591 draw calls per frame on low / medium / high (the extra on high is ambient occlusion drawing the scene a second time). New downloads: 1.1 MB soldier, 451 KB guns, 1.4 MB textures. Culling and the far body took the friend's screen in the two-tab co-op test from 257,000 triangles a frame to a fraction of that.

## Progression (M7)

Lessons 23–25 explain how. XP and the profile live in each browser; attachments and call-ins are simulation, decided by the host.

| Thing | What | Where |
|---|---|---|
| XP | Kill 100, headshot +50, revive 150, stage 400, mission 1,000, the Compound 800; ×0.75 / 1 / 1.5 by difficulty, ×1.25 at night. Guns also earn 1 XP per 10 damage. The Proving Ground earns nothing | `XP` in `game/xp.js` |
| Ranks | 1–20; rank 2 at 1,500 XP, each rank 500 XP further than the last | `PROGRESSION` in `game/profile.js` |
| Rank unlocks | Start: carbine, pistol, supply drop. SMG 2, recon drone 3, shotgun 4, smoke 5, DMR 6, mortar 8 | `RANK_UNLOCKS` |
| Gun levels | 1–10 per gun; level 2 at 600 gun XP, each 200 further. Red dot 2, extended mag 3, foregrip 4, suppressor 5, holo 6, fast mag 7, compensator 8, laser 9, 2× scope 10 | `GUN_LEVEL_UNLOCKS` |
| Saving | localStorage (`fireteam.profile`), checked on load, versioned; backup code `FT1-…-XXXX` with an FNV-1a checksum | `game/profile.js` |
| Loadout | Primary (carbine, SMG, shotgun, DMR) + pistol, attachments per gun, one call-in; the Proving Ground hands out every gun | `ui/loadout.js`, `loadoutFor` |

### Attachments

| Slot | Attachment | Changes |
|---|---|---|
| Optic | Red dot | zoom 1.45×, aimed spread −10% |
| | Holographic | zoom 1.6×, aimed spread −15%, aiming +8% slower |
| | 2× scope | zoom 2.2×, aimed spread −40%, aiming +35% slower, slower while aimed; scope view |
| Muzzle | Suppressor | heard 0.45× as far, no flash (no light at night), damage range −10% |
| | Compensator | kick −25%, louder (+15%) |
| Magazine | Extended | +50% rounds, reloads +15% slower |
| | Fast mag | reloads 25% quicker |
| Underbarrel | Foregrip | recoil pattern and shake −40%, aimed spread −15% |
| | Laser | hip spread −30%, moving spread −15%; lights you at night (0.5) |

The DMR is now yours from rank 6 (zoom 2.5×, its scope built in, so no optic slot).

### Call-ins

| Call-in | What | Numbers |
|---|---|---|
| Charge | From kills (12%, +4% headshot), objectives (35%), and 1/300 a second; each use: next charge 1.3× slower; always full on the Proving Ground | `CALLINS.charge`, `slower` |
| Calling | T / View; aimed where you look, within 60 m; 1.5 s of radio first; supply and mortar need open sky | `range`, `windup` |
| Supply drop | Parachute 6 s; then an ammo crate with 2 refills per player | `supply` |
| Recon drone | 25 s; marks enemies within 35 m for the squad | `recon` |
| Mortar | Red smoke and a marker; 3 s later 4 shells over 3 s within 6 m (220 damage, 7 m blast, never the squad); enemies may run | `mortar` |
| Smoke screen | 4 clouds of 3 m in a line across your view, 25 s; blocks eyes (`SMOKE` group), not bullets | `smoke` |

## Polish and content (M8, M9)

Lessons 26–27 explain how.

| Thing | What | Where |
|---|---|---|
| Rebinding | Settings → Controls: click, press a key or mouse button; one key per action; Escape and ` reserved; prompts follow | `core/input.js` (`bindingsWith`, `keyName`), `ui/menus.js` |
| HUD | Size 75–150%, show/hide, subtitles on/off, interface volume | `core/settings.js`, `ui/style.css` |
| Automatic quality | Under 40 fps for 5 s while playing: one level down, never back up by itself | `PERF` in `core/perf.js` |
| Touch | Stick where the left thumb lands (60 px), drag right half to look, 9 buttons + pause; `?touch` to force | `ui/touch.js` |
| Kingpin (eliminate) | Officer (×2.5 health) + 2 guards at the yard, warehouse B or the village square; down him, extract | `eliminate` in `game/objectives.js`, `levels/missions.js` |
| Modifiers | Iron man (no checkpoints, +30% XP), Scarce supplies (half crate refills and call-in charge, +20%), Lethal (double damage both ways, +30%) | `MODIFIERS` in `game/modifiers.js` |

Version 1.0 is milestones 0–9. What it leaves out is under **Open questions**.

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
| Switch gun | 1–5, mouse wheel, Q for the last gun |
| Squad radio (co-op) | V (hold) |
| Ping (co-op) | Z or middle mouse |
| Throw a grenade | G |
| Call-in (once charged) | T |
| Night-vision goggles (night missions) | N |
| Use (revive, free, plant, download, ammo, radio) | F (hold) |
| Spectating: next teammate | Left mouse |
| Rebind any of these | Settings → Controls |
| Tuning panel | `` ` `` |
| Pause | Esc |

When you're down in a solo fight, R starts it again. In co-op the host presses R once the whole squad is down. In a mission, R retries from the last checkpoint instead (also when the hostage dies while you're standing). Controllers work too (since M6): see the controller table on the title screen and `core/gamepad.js`; on a controller, X does what R and F do (tap to reload, hold to use). On a touch screen, on-screen controls appear (since M8). Keys can be rebound in Settings → Controls.

## Art direction

- **Stylized military.** Chunky, simplified shapes; slightly exaggerated proportions; flat-ish colours with soft lighting. Think "toy soldier diorama", not "documentary".
- **Colour carries meaning.** Amber marks interactive things and the HUD's important bits. Red means danger. Teammates wear cool blue accents, enemies warm red; each player slot has its own colour (amber, blue, green, pink) in the roster and on name tags.
- **Readability first.** Enemies must stand out from backgrounds at a distance. Shadows are soft, so they never hide a threat completely.
- **Clean toon.** Real but simplified models, textures that bring detail but keep the palette's colours (and their meanings), soft ambient occlusion, dark outlines on people, a little bloom on bright things, and a colour grade per map.
- **A mood per map.** Midday, dusty haze, golden hour; and night, dark but never black.
- **The grid stays.** A faint line every metre in every texture, so distances still read at a glance.

## Audio direction

Punchy weapon sounds from real CC0 recordings, with a short echo; every play slightly varied in pitch so automatic fire never sounds robotic; positional impacts; footsteps that change with the surface. Since M3: enemy gunfire and footsteps placed in 3D and duller with distance (far sounds lose their treble), bullet whizzes past your ear, a heartbeat at low health, a radio click with every callout, and a tone with the Marksman's laser. Since M4: voice chat (squad radio through a radio filter, nearby voice placed in 3D), teammates' footsteps and gunfire, a handset click when someone keys the radio. Since M5: explosions (two CC0 recordings layered: a deep boom and a crunch), grenade bounces, the helicopter's rotor (a generated loop that gets louder as it comes in), chimes for checkpoints and success, and Overlord's radio lines as subtitles. Still to come: recorded voices for callouts, music that rises with combat intensity.

## Accessibility (ongoing)

Already in: pings and markers so a squad can play without voice, push-to-talk or voice off, per-player mute, reduce camera motion, hold or toggle for crouch, sprint and aiming, adjustable field of view and sensitivity, difficulty levels, subtitles for enemy callouts, and an on-screen arrow for every threat you might only hear (damage direction, someone noticing you, a laser on you). Coming: key rebinding, colour-blind-safe markers, aim assist on gamepad and touch.

## Tech overview

- Plain JavaScript ES modules with an import map, with no build step.
- three.js for drawing, Rapier for physics, lil-gui for the tuning panel, all vendored in `vendor/` at pinned versions.
- PeerJS 1.5.5 (WebRTC) for peer-to-peer co-op: one player's browser hosts the game; voice is a mesh. Its free broker introduces players; its free TURN servers relay when a network blocks direct links.
- Simulation runs at a fixed 60 Hz; drawing interpolates between ticks.
- Art comes from CC0 packs, trimmed by tools in `tools/` (glTF Transform and meshoptimizer for models, Pillow for textures) whose output is committed; `render/assets.js` loads it once, and every piece has a code-built fallback.
- Simulation code never touches the screen, so it's unit tested in Node.

## Open questions

- ~~How much should aiming slow you down?~~ Decided in M2: to 60–75% of normal speed depending on the gun (`ads.move`), and you can't sprint while aiming.
- ~~Should guns have a limited spare-ammo pool in missions, with ammo crates?~~ Decided in M5: yes, limited spare ammo in missions, refilled at crates; the practice maps stay infinite.
- ~~Friendly fire: off, on, or an option?~~ Decided in M4: off.
- ~~Do downed players bleed out?~~ Decided in M4: yes, after 30 s, unless a teammate revives them; then you spectate until the next fight.
- When the host leaves, hand the game to another player ("host migration") instead of ending it? Possible, because every client has the level; the hard part is moving the enemies' brains. Later.
- Some strict networks can't connect even through the free relay. A paid TURN service, or our own? Decide if players hit it.
- Hits are trusted to each player's browser (favour the shooter). Fine for friends; a public matchmaking mode would need the host to check shots properly (lag compensation).
- Should enemies vault low walls and drop off ledges? The nav grid has no "jump links" yet, so they walk round. Decide when a map needs it.
- ~~Grenades (yours and theirs) to flush enemies out of cover?~~ Decided in M5: yours, 2 per mission. Enemy grenades later (they'd need their own fairness rules: a warning, a marker, time to run).
- ~~When you go down in a solo mission: restart the whole fight, or a checkpoint?~~ Decided in M5: retry from the last checkpoint. The practice Compound still restarts the whole fight.
- Mission length: the target is 8–12 minutes on Regular. A scripted run with frozen enemies takes 2–4 minutes of walking and waiting, so the rest is fighting; tune the director with real squads.
- ~~Mission props (the caches, the laptop's table, the radios) are drawn but have no colliders.~~ Decided in M6: every site has a solid table, crate stack or radio stand as level geometry, the same in every mission and on every computer; the mission only adds what sits on top.
- Enemy night vision, searchlights on the cranes, lit windows? The night has lamps and torches only. Decide when night missions get tuned with real squads.
- Real frame rates on medium and high need measuring on real machines (the test machines draw in software).
- The host builds each friend's guns from the loadout they send, checking its shape but not whether they've unlocked it (progress lives in each browser). Fine among friends; public games would need progress kept by a server.
- Enemy call-ins (their own mortar team, a spotter drone)? They'd need the same fairness: a warning, a marker, time to move. Later.
- How fast should call-ins charge? The first charge takes up to 5 minutes, sooner with kills; tune with real squads.
- Should the Proving Ground let you try every attachment (a gunsmith bench by the rack)? Today it hands out every gun, with no attachments.
- More missions on the Compound (a raid), and more mission types (escort a convoy, defend a position that moves)? M9.
- Version 2 ideas: more maps (a raid on the Compound, a town), an escort-a-convoy mission, enemy grenades and call-ins (with warnings), host migration, controller button rebinding, a gunsmith bench on the Proving Ground.
