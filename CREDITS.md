# Credits

Third-party code and assets in this repository, with their licences.

| What | Version | Where | Licence |
|---|---|---|---|
| [three.js](https://threejs.org/) | 0.186.1 | `vendor/three/` | MIT (`vendor/three/LICENSE`) |
| three.js add-ons (`examples/jsm` from the same npm package): the glTF loader and its helpers, the meshopt decoder, post-processing passes and shaders | 0.186.1 | `vendor/three/addons/` | MIT (`vendor/three/LICENSE`). Only the files we use are copied, with the same folder layout |
| [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) | 0.21.0 | `vendor/rapier/` | Apache-2.0 (`vendor/rapier/LICENSE`) |
| [lil-gui](https://lil-gui.georgealways.com/) | 0.21.0 | `vendor/lil-gui/` | MIT (`vendor/lil-gui/LICENSE.md`) |
| [PeerJS](https://peerjs.com/) (`peerjs`, the `dist/peerjs.min.js` build) | 1.5.5 | `vendor/peerjs/` | MIT (`vendor/peerjs/LICENSE`). Loaded only when you host or join a co-op game. Its free public broker (`0.peerjs.com`) and relay servers (`turn.peerjs.com`) introduce players to each other |
| [Barlow and Barlow Condensed](https://github.com/jpt/barlow) fonts | Google Fonts v13 | `assets/fonts/` | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) |
| [Playwright](https://playwright.dev/) (tests only, not shipped) | 1.56.1 | `package.json` | Apache-2.0 |
| [glTF Transform](https://gltf-transform.dev/) (`@gltf-transform/core`, `/functions`; `tools/build-models.mjs` only, not shipped) | 4.5.1 | `package.json` | MIT |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) (`meshoptimizer`: simplifies the far-away soldier; `tools/build-models.mjs` only, not shipped) | 1.3.0 | `package.json` | MIT |

## Models

All CC0 (public domain). Credit isn't required, but these people made them. `tools/build-models.mjs` turns the original packs into the files in `assets/models/` (keeping only what the game uses).

| Model | Source | Author |
|---|---|---|
| The soldiers and the hostage, and their animations (`assets/models/soldier.glb`: the mannequin and 10 clips) | [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) and [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2), Standard (free) editions | Quaternius |
| The guns (`assets/models/guns.glb`: AssaultRifle2_2, SubmachineGun_2, Shotgun_1, Pistol_1 and SniperRifle_4, repainted in our colours) | [Ultimate Gun Pack](https://quaternius.itch.io/50-lowpoly-guns) | Quaternius |

The helmets, vests, packs and goggles on the soldiers, and the red dot sight on the carbine, are built by code (`src/render/character.js`, `src/render/gun-models.js`).

## Textures

All CC0 (public domain), from [Poly Haven](https://polyhaven.com/license). `tools/build-textures.py` turns each 1K set into a small grey detail picture (the game paints it with the map's colours) and a normal map, in `assets/textures/`.

| Surface | Poly Haven texture | Author |
|---|---|---|
| Concrete (floors, quay, ledges, ramps, stairs, posts, floor paint) | [concrete_floor_02](https://polyhaven.com/a/concrete_floor_02) | Rob Tuytel |
| Ground (and sandbags) | [gravel_concrete_03](https://polyhaven.com/a/gravel_concrete_03) | Charlotte Baglioni |
| Plaster (walls, whitewash) | [plastered_wall_03](https://polyhaven.com/a/plastered_wall_03) | Rob Tuytel |
| Brick | [red_brick_03](https://polyhaven.com/a/red_brick_03) | Rob Tuytel |
| Corrugated metal (containers, sheet roofs) | [corrugated_iron_02](https://polyhaven.com/a/corrugated_iron_02) | Sergej Majboroda, Jenelle van Heerden |
| Roof tiles | [roof_09](https://polyhaven.com/a/roof_09) | Rob Tuytel |
| Wood (crates, planks) | [weathered_planks](https://polyhaven.com/a/weathered_planks) | Dimitrios Savva, Dario Barresi |
| Asphalt | [asphalt_02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel |
| Steel plate | [metal_plate](https://polyhaven.com/a/metal_plate) | Rob Tuytel |

## Sounds

All sounds are CC0 (public domain). Credit isn't required, but these people made them. `tools/build-sounds.py` turns the original recordings into the files in `assets/sounds/`.

| Sounds | Source | Author |
|---|---|---|
| Gunshots (`rifle`, `smg`, `shotgun`, `pistol`) | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) (AR-15, Carl Gustav M45, Benelli Nova, Walther PPQ, near-distance takes) | Ben Jaszczak et al. |
| Rifle and SMG reloads, charging handle, shotgun pump (`reload_rifle`, `reload_smg`, `charge`, `pump`) | [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds) | SpringySpringo |
| Pistol reload (`reload_pistol`) | [Handgun Reload Sound Effect](https://opengameart.org/content/handgun-reload-sound-effect) | zer0_sol |
| Shotgun shell and rack (`shell`, `rack`) | [Shotgun Reload Sound Effects](https://opengameart.org/content/shotgun-reload-sound-effects) | zer0_sol |
| Weapon handling clicks (`gear`) | [Equipment Clicks II](https://opengameart.org/content/equipment-clicks-ii) | LFA |
| Dry-fire click (`dry`) | [Gun reload, lock or click sound](https://opengameart.org/content/gun-reload-lock-or-click-sound) | pauliuw |
| Impacts, steel ding, casings, footsteps, landing, hits on soldiers, being hit, bodies falling, grenade bounces (`hit_*`, `ding`, `casing`, `step_*`, `land`, `hit_flesh`, `hurt`, `bodyfall`, `bounce`) | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney |
| Explosions (`explosion`: a low boom and a crunch played together) | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) (`lowFrequency_explosion`, `explosionCrunch`) | Kenney |

Interface sounds (hitmarkers, beeps), bullet whizzes, the heartbeat, the radio click, the Marksman's laser tone and the helicopter's rotor are generated by code in `src/audio/audio.js`, as is a stand-in for every recording in case it fails to load.

To update a library: download the new version from npm, replace its files in `vendor/`, update this table, and run `npm test` and `npm run smoke`.
