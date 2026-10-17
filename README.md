# Fireteam

A co-op first-person shooter for the browser, built step by step as a game-development course. Each milestone adds a playable feature *and* a plain-English lesson explaining how it works.

**Play:** https://hartj77-blip.github.io/shooter-game-2/

**Now:** Milestone 7, **Progression**: every mission counts.
- **XP and ranks:** kills, revives, objectives and missions earn XP (more on Veteran and at night). Your **rank** unlocks guns (SMG, shotgun, the DMR) and call-ins; each gun's own **level** unlocks its attachments. The debrief shows what you earned.
- **Attachments:** red dot, holographic and 2× scope sights (with a proper scope view), suppressor, compensator, extended and fast magazines, foregrip and laser. Each changes the gun's numbers, and you see it on the gun.
- **Loadout:** pick your gun, its attachments and your call-in on the **Loadout** screen (title screen or lobby). In co-op everyone brings their own, and you see your friends' attachments.
- **Call-ins:** earn a charge, then press **T** to call in a **supply drop**, a **recon drone** that marks enemies, a **mortar strike** (with a fair warning) or a **smoke screen** where you look.
- **Saved progress:** kept in your browser, and a **backup code** (bottom of the Loadout screen) takes it to another one.

Milestone 6 brought the art: animated soldiers, real gun models, textures, a mood per map, night missions with night vision, and controller support.

The missions, from milestone 5, are on the Harbour, solo or with up to three friends. Pick one on the title screen (Day or Night):

- **Lifeline** (rescue): find the hostage somewhere in the fishing village, free them, and get them to the helicopter alive.
- **Dead Drop** (intel): find the laptop, defend it while it downloads, and carry the drive out.
- **Short Fuse** (sabotage): blow up three hidden weapons caches.
- **Last Light** (hold the line): switch on the lighthouse radio and hold the headland for three minutes.

Every mission ends with **extraction**: call the helicopter, survive while it flies in, and get aboard. A **director** watches how the fight is going: it sends reinforcements while things are calm and gives you a breather after a hard fight. Ammo is limited in missions (refill at the ammo crates), you carry two **grenades** (G), and if everyone goes down you retry from the last **checkpoint**. A debrief shows how it went.

Or practise:

- **The Compound:** clear a walled compound held by 16 enemy soldiers. Riflemen take cover and peek, Rushers charge and flank, and Marksmen warn you with a laser before each shot. They see and hear you, call out to each other, and search where they last saw you. Health recovers if you get out of the fire.
- **The Proving Ground:** the practice area from milestones 1 and 2: the movement course, every gun (whatever your loadout), the firing range and the timed kill house. Call-ins are always charged here, to try them out.

Then press **Play solo**, **Host co-op** or **Join co-op**.

### Playing co-op

1. Type a **callsign** (your name in game) on the title screen.
2. One of you presses **Host co-op** and shares the **room code** (or the invite link from *Copy invite link*).
3. Everyone else presses **Join co-op** and types the code (or just opens the link).
4. The host picks the mission (or practice map) and difficulty and presses **Start**. Friends can also join a game that's already running.

In the game:
- Hold **V** to talk on the **squad radio**. Teammates close by also hear you without it (**nearby voice**).
- Press **Z** (or click the mouse wheel) to **ping** an enemy or a spot.
- If someone goes down, they have 30 seconds: hold **F** next to them for 3 seconds to **revive** them.
- Friendly fire is off. Wear headphones, so your teammates don't hear themselves echo.

No accounts and no servers to rent: browsers connect directly (WebRTC), introduced by PeerJS's free service. On some strict networks (some schools and offices) players can't connect.

Every number (movement, guns, enemies, the director, grenades, call-ins) has a slider in the live tuning panel.

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
| 1–5, mouse wheel, Q | Switch gun; Q swaps back to the last one |
| G | Throw a grenade (missions) |
| T | Call in your support where you're looking, once it's charged |
| N | Night-vision goggles (night missions) |
| F (hold) | Use: revive a teammate, free the hostage, start the download, plant a charge, take ammo, call the helicopter |
| R (when you're down) | Try again: from the last checkpoint in a mission, from the start in the Compound (in co-op, the host once everyone's down) |
| V (hold) | Squad radio (co-op) |
| Z or middle mouse | Ping what you're aiming at (co-op) |
| `` ` `` (under Esc) | Tuning panel (pauses the game) |
| Esc | Pause |

A controller works too: sticks to move and look, RT to fire, LT to aim, X to reload (tap) or use (hold), RB for a grenade, View for your call-in, D-pad down for night vision. The full table is on the title screen.

Difficulty (Recruit, Regular, Veteran), mouse and aiming sensitivity, field of view, hold-or-toggle for crouch, sprint and aiming, volume, reduced camera motion, graphics quality (low, medium, high), controller look speed, aim assist and vibration, your callsign and voice chat (radio + nearby, push-to-talk only, or off; volume) are in **Settings**.

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
  11. [How co-op works](docs/lessons/11-how-co-op-works.md)
  12. [Prediction and trust](docs/lessons/12-prediction-and-trust.md)
  13. [Voice, rooms and the internet](docs/lessons/13-voice-rooms-and-the-internet.md)
  14. [Missions as data](docs/lessons/14-missions-as-data.md)
  15. [The director](docs/lessons/15-the-director.md)
  16. [Building a big map](docs/lessons/16-building-a-big-map.md)
  17. [Supplies, grenades and escorts](docs/lessons/17-supplies-grenades-and-escorts.md)
  18. [3D models and assets](docs/lessons/18-models-and-assets.md)
  19. [Skeletal animation](docs/lessons/19-skeletal-animation.md)
  20. [Light, materials and post-processing](docs/lessons/20-light-materials-and-post-processing.md)
  21. [Seeing in the dark](docs/lessons/21-seeing-in-the-dark.md)
  22. [Controllers](docs/lessons/22-controllers.md)
  23. [Progression and saving](docs/lessons/23-progression-and-saving.md)
  24. [Attachments as data](docs/lessons/24-attachments-as-data.md)
  25. [Call-ins and fair area effects](docs/lessons/25-call-ins-and-fair-area-effects.md)
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md): every term in plain English
- [`docs/DESIGN.md`](docs/DESIGN.md): the game design document and roadmap

## Run it on your computer

Browsers won't load modules from a double-clicked file, so serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Add `?debug` to the address to open the tuning panel straight away, and `?map=compound` (or `?map=harbour-rescue`, `harbour-intel`, `harbour-sabotage`, `harbour-hold`) to go straight to a map.

To try co-op on your own, open two tabs with `?net=local` (for example `http://localhost:8000/?net=local`), host in one and join with the code in the other. That uses the browser's `BroadcastChannel` instead of the internet. Voice chat needs the real online version.

## Tests

```sh
npm install        # once: installs Playwright, used only by the browser test
npm test           # unit tests: movement, weapons, enemy AI, pathfinding, the Compound, the Harbour, every mission,
                   # the director, grenades, ammo crates, checkpoints, XP and saving, attachments, call-ins, and co-op
                   # over a pretend network with delay, jitter and packet loss (prediction, revives, loadouts, the lobby)
npm run smoke      # opens the real game in a headless browser: walks, shoots, fights in the Compound, loads the
                   # Harbour, switches maps, changes the loadout, aims a scope, calls in smoke, restores a backup
                   # code, and plays co-op in two tabs (the Compound, then a rescue)
```

GitHub runs both on every pull request (`.github/workflows/ci.yml`).

## Project layout

```
index.html        the page, the import map, menus and HUD
src/main.js       the app shell: boots everything and runs the game flow
src/mission.js    one map, built and torn down without a page reload
src/core/         game loop, input, controllers, events, settings, state machine, seeded random, tuning panel
src/world/        physics (Rapier), collision groups, the level kit, level building, surfaces, targets, lighting
src/weapons/      the weapon table, attachments, guns, the arsenal, hitscan, grenades
src/player/       movement controller, soldier (movement + guns + hitboxes), health, first-person camera
src/ai/           enemies: roles, senses, brains, squads, the nav grid, A*, cover, noise; the hostage
src/game/         the shared simulation (sim.js), the kill house course, the Compound's rules, revives, pings,
                  missions (operation, objectives, the director, the helicopter), hold-to-interact, ammo crates,
                  call-ins, your profile (XP, ranks, unlocks, saving) and the XP counter
src/net/          co-op: transports, the protocol, rooms, the host, clients (prediction), stand-ins, voice
src/render/       renderer, moods, post-processing, outlines, assets, materials, level meshes, signs,
                  guns, viewmodel, effects, targets, animated characters (and the block fallback),
                  ragdolls, AI debug views, mission props, the helicopter, the night, call-ins
src/audio/        sound engine, sound bank, game sounds
src/ui/           HUD, squad HUD, objective HUD, call-in HUD, markers, debrief, lobby, loadout, menus, styles
levels/           maps and missions, written as data
vendor/           pinned copies of three.js (and its add-ons), Rapier, lil-gui and PeerJS
assets/           fonts, sounds, models and textures
tools/            build-sounds.py, build-models.mjs and build-textures.py (turn CC0 packs into game files)
tests/            unit tests (Node) and the smoke tests (Playwright)
docs/             design document, glossary, lessons
```

## Roadmap

| | Milestone | |
|---|---|---|
| ✅ | M0 Setup | repo, tests, CI, design doc |
| ✅ | M1 Move like a pro | movement, Proving Ground, tuning panel |
| ✅ | M2 Gunfeel | four guns, recoil, aiming, effects, sound, range, kill house |
| ✅ | M3 Enemies | AI soldiers, senses, squads, pathfinding, cover, ragdolls, the Compound |
| ✅ | M4 Co-op | 1–4 players, peer to peer, prediction, revives, pings, voice |
| ✅ | M5 Missions | the Harbour, four missions, the director, extraction, grenades, checkpoints |
| ✅ | M6 Art pass | animated soldiers, gun models, textures, moods, post-processing, night missions, controllers |
| ✅ | M7 Progression | XP, ranks, unlocks, attachments, loadouts, call-ins, saved progress |
| ⏭ | M8 Polish | audio, HUD, settings, touch |
| | M9 Content | maps, mission types, difficulty |

## Credits

Third-party libraries, fonts, sounds, models and textures are listed with their licences in [CREDITS.md](CREDITS.md).
