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
- **Simulation is separate from presentation.** `src/player/{controller,soldier,hitboxes,health}.js`, `src/world/*`, `src/weapons/*`, `src/ai/*`, `src/game/*`, `src/net/*` (except `voice.js` and `peer-loader.js`, which are browser-only) and `src/core/{loop,input,gamepad,events,fsm,settings,random}.js` must run in Node with no DOM or three.js renderer. Drawing, camera feel, HUD and sound only read simulation state. Ragdolls are presentation: they live in their own physics world (`src/render/ragdolls.js`) and never touch the real one.
- **Input becomes commands.** Simulation reads command objects, never the keyboard. Keep it deterministic (same commands give the same result; there's a test).
- **Data-driven tuning.** Feel-related numbers live in tuning tables (`DEFAULT_TUNING`, `DEFAULT_CAMERA_TUNING`, `WEAPONS`, `ROLES`, `AWARENESS`, `NOISE`, `DIFFICULTY`, `DIRECTOR`, `OBJECTIVES`, `GRENADE`, `SUPPLY`, `HOSTAGE`, `HELI`, `LIGHTING`, `GAMEPAD`, `POST`, `OUTLINE`, `NIGHT_VIEW`, `CALLINS`) with sliders in `src/core/debug.js`; the progression tables (`ATTACHMENTS`, `PROGRESSION`, `RANK_UNLOCKS`, `GUN_LEVEL_UNLOCKS`, `XP`) are data too, without sliders. Levels and missions are data in `levels/`.
- **Units:** metres, seconds, radians in code (degrees in UI). Y is up, north is -Z.
- **Comments explain why**, in plain English. Each file starts with a short header saying what it does and what it talks to.
- **One tick, in order** (`tick()` in `src/game/sim.js`, shared by solo play, the co-op host and the tests; every player's step runs before the enemies'): `soldier.move` → `enemies.move` → `hostage.move` → `targets.update` → `world.step()` → `soldier.act` (your shots traced, grenades thrown, pings and call-ins) → `enemies.playerShots` → `grenades.update` → `callins.update` (drops, drones, shells, smoke) → `enemies.think` (senses, brains, routes) → `enemies.act` (their shots) → `health.update` (players, hostage) → `revives.update` → `interactions.update` (hold F) → `course` / `encounter` / `operation.update` → `director.update` (last). New or moved colliders (targets, hitboxes, spawned enemies, smoke) are only found by rays after a `world.step()`.
- **Every physics query passes a collision group** from `src/world/groups.js`: `MOVE` for walking and body checks, `BULLET` for shots, `SIGHT` for eyesight (it meets smoke), `LEVEL` for mapping, ledges, grenades, hearing through walls and the floor under your feet (nobody climbs onto a person, nothing bounces off one, smoke doesn't muffle). Any new collider that isn't level geometry needs its own group (characters are `CHARACTER_GROUPS`, hitboxes `HITBOX_GROUPS`, invisible map edges `BOUNDARY` (only `MOVE` meets them), the hostage `ESCORT` (everyone walks through them), smoke screens `SMOKE` (only `SIGHT` meets them: eyes stop, bullets don't)).
- **Events connect simulation to presentation** (`weapon:fire`, `bullet:impact`, `target:hit`, `player:hurt`, `bullet:nearmiss`, `enemy:down`, `enemy:bark`, `explosion`, `grenade:*`, `course:*`, `encounter:*`, `mission:*`, `objective:*`, `extract:*`, `hostage:*`, `director:*`, `callin:*`...). Viewmodel, effects, audio and HUD listen; they never change the simulation. Every soldier event carries `owner` (a player slot 0–3, or `e3` = enemy 3): listeners for *your* feedback (camera, viewmodel, hit markers) must compare it with the local player's slot (`owner`/`me` options), which is not always 0 in co-op.
- **Enemies are soldiers driven by brains.** `src/ai/brain.js` decides intent; `src/ai/enemy.js` turns intent into the same commands the keyboard makes. Role differences are numbers in `ROLES` (`src/ai/enemy-data.js`), not code. Keep the fairness rules (reaction time, settling aim, warning shots, attack tokens, telegraphs) when adding enemy types.
- **Levels with enemies** set `nav: { min, max }` (the area to map) and use `enemy` pieces. Stairs enemies should climb need steps (`run`) at least 0.35 m deep. The Compound's and the Harbour's tests check every enemy spot (and site, crate, LZ, entry route) is reachable and nobody can see the spawn: do the same for new maps. On big maps ask "same island?" (`nav.component`), not A\* (it gives up at 60,000 squares). A `site`'s `safe` spot is on the ground unless it gives a height.
- **Springs in presentation code must be sub-stepped** (small fixed steps per frame). One big step on a slow frame explodes them; lesson 6 tells the story.
- **Assets must be CC0** (or similarly free) and credited in `CREDITS.md`. Check the licence on each source page before downloading. Sounds are rebuilt with `tools/build-sounds.py`; every sound needs a synthesized fallback.

## Co-op (milestone 4)

- **The host is the referee** (`src/net/host.js` over `src/game/sim.js`); solo play is a host session for one. Clients (`src/net/client.js`) predict their own soldier and draw everyone else from snapshots via stand-ins (`src/net/proxies.js`). Lessons 11–13.
- **Same rules on both computers.** Anything that changes how a command plays out (downed players stand still, holding F blocks the gun) must be decidable from the command and state the client also has, or prediction will disagree with the host. Stand-ins must have the same shapes as the real thing (`bodyCollider()`). Commands are rounded (`roundCommand`) before the client predicts with them.
- **Events that should reach clients** go in `SHARED_EVENTS` in `src/net/protocol.js` (with `eventFor` deciding who gets what; whole families like `mission:*` and `objective:*` go to everyone). Only plain data crosses the wire (`wireEvent`). Every message format is documented in `protocol.js` or `room.js`.
- **Presentation reads `view` summaries** (`viewOf` in `src/ai/enemy.js`, `playerView` in `src/game/sim.js`, proxies' `view`), never enemy or player internals, so host and clients draw the same way.
- **Tests:** `tests/support/coop.js` runs a host and clients over a pretend network (`createLoopbackNet`: delay, jitter, loss). `tests/smoke/coop.spec.js` plays two tabs over `BroadcastChannel` (`?net=local&nolock`) with Chromium's pretend microphone. Keep the "perfect network, nobody touching: zero corrections" test passing: it catches client/host disagreements.

## Missions (milestone 5)

- **Missions are data** (`levels/missions.js`: stages, candidate sites, director settings, key moments). Each objective kind in `src/game/objectives.js` has `update`, `spots` (hold-F offers; objectives never read input), `save`/`restore`, and `phase`/`progress`/`timer`. `src/game/operation.js` runs the stages. Lessons 14–17.
- **Presentation reads `operation.view`** (sent to clients as `op`), never the objectives. Props, the helicopter (`heliPath`, a function of time) and the objective HUD are drawn from it, so every screen agrees.
- **Checkpoints save only what matters** (stage, objective, cargo, hostage, the garrison's dead, crate refills, safe spots; each browser saves its own ammo). Reinforcements are never saved.
- **Who owns what:** your browser owns your ammo (a refill is "fill to full", which gives the same answer whenever it arrives; the host only checks loosely). The host owns crates, explosions, the hostage, the mission and the director. Every computer flies each grenade itself from one rounded `grenade:throw`; grenades only bounce off `LEVEL`. Objective state never changes how a command moves you.
- **The director runs last**, uses the seeded random, and spawns only at `entry` pieces nobody standing can see, at least `minDistance` away, under `maxAlive`.
- **Objects with a `view` getter** are built with `Object.defineProperties(obj, Object.getOwnPropertyDescriptors({...}))`, never `Object.assign` (which freezes the getter's first answer; lesson 14).
- **Looping sounds** (`audio.loop()`) must be stopped in the mission's `dispose()`; the "leaves nothing behind" smoke test checks `audio.loops` is 0.
- **Draw calls:** the level is batched per material in 32 m tiles (`render/level-view.js`); a smoke test keeps the Harbour under 260 calls on low quality.

## Progression (milestone 7)

- **Your progress is yours.** `src/game/profile.js` (rank, XP, gun XP, loadout) lives in each browser's localStorage, is checked on load (`cleanProfile`: never trust saved data) and versioned (`migrate`). The backup code is `FT1-<base64url>-<checksum>`. XP is counted from events each browser already gets (`src/game/xp.js`, `owner === me`), never inside the rules. Lessons 23–25.
- **Attachments are data** (`src/weapons/attachments.js`): `[path, 'set'|'mul', value]` mods plus a few flags (`suppressed`, `laser`, `optic`), applied by `withAttachments()` to a copy of the gun's row. Never `if (hasSuppressor)` in a rule: change a number, or read a flag. `'reload'` means every reload time a gun has (the shotgun's are different). Test new ones against every gun in `FITS`.
- **Loadouts in co-op:** each browser sends its guns and call-in with `loaded` (`src/net/room.js`); the host cleans them (`cleanArsenal`) and builds that soldier with them, and the client predicts with the same. The roster shares loadouts, so teammates' attachments are drawn (`attachmentsIn`). Snapshots name guns by `ARMORY` order: new guns go on the end.
- **Call-ins** (`src/game/callins.js`) are host-owned: a `callin` command bit, `callin:*` events (`callin:refused`/`ready` are personal), each player's charge in their row, active call-ins in snapshots (`ci`). Area effects play fair: a warning first, never the squad (the mortar uses the grenade's `explode`), and enemies get the warning as a hazard. Clients add the same smoke colliders (`addSmoke`).
- **Practice maps** (`armory: true`, the Proving Ground) hand out every gun and keep call-ins charged.

## Art pass (milestone 6)

- **Assets** come from CC0 packs through the build tools (`tools/build-models.mjs`, `tools/build-textures.py`); commit their output, not the packs. Every file is in `MANIFEST` (`src/render/assets.js`), has a size budget in `tests/unit/assets.test.js`, and a row in `CREDITS.md`. Lessons 18–22.
- **Every asset has a fallback.** A failed file gives `null` and the code-built version is drawn (block soldiers, block guns, the grid). Node tests run with no assets at all, so the fallbacks stay tested; the browser test checks `assets.failed` is empty.
- **Moods are data** (`src/render/moods.js`): a level names one (`mood: 'golden'`) and its `sun` gives the direction. Presentation only.
- **Gun points live in `GUN_MODELS`** (`src/render/gun-models.js`). `buildGun()` returns the points for whichever gun it built; never read `def.model` points for a model gun.
- **Characters** (`src/render/character.js`): legs from clips, spine and arms from code (two-bone IK). Skinned meshes are culled with a padded bounding sphere and have a far body (`detail()`); ragdolls switch culling off. Dispose skeletons (their bone textures).
- **Decor has no colliders and never pokes into an opening.** Anything solid is a `solid`; mission sites' `prop`s are solid level geometry, the same in every mission and on every computer.
- **Darkness is simulation, the night's look is not.** `src/world/lighting.js` (`lightAt`, `flashlightOn`) is plain arithmetic, deterministic, run by the host's AI; by day it's 1 and changes nothing. `render/night-view.js` keeps a fixed number of real lights (changing the count rebuilds shaders) and fakes the rest. Night vision is presentation only (`view.nvg`).
- **Post-processing** (`src/render/post.js`): world → (AO) → your gun → (bloom) → OutputPass → grade. Quality tiers in `QUALITY` (`src/render/renderer.js`); a browser test checks each tier draws within budget.
- **Night missions** are separate map ids (`harbour-rescue-night`, `missionLevels`); the title's Day/Night switch picks between them.

## Checks before pushing

```sh
npm test         # unit tests (Node, a few seconds)
npm run smoke    # headless browser test (needs `npm install` once)
```

Add a regression test for every movement or simulation bug fixed. In this container the preinstalled Chromium matches `@playwright/test` 1.56.1; CI installs its own.

## Deploy

GitHub Pages serves `main` from the repo root. `.nojekyll` is there so every file is served as-is.
