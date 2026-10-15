# Glossary

Every game-dev term we use, in plain English. New terms get added as each milestone introduces them. The lesson where a term is explained properly is in brackets.

| Term | Meaning |
|---|---|
| **A\* ("A star")** | The route-finding method enemies use: always explore next the square that looks most promising (distance so far + distance still to go). Like a sat-nav. (Lesson 9) |
| **Accumulator** | The "bucket of time" the game loop fills with real time and empties in fixed ticks. (Lesson 1) |
| **ADS (aim down sights)** | Raising the gun to your eye to aim through its sights: tighter spread and a zoomed view, but you move slower. (Lesson 6) |
| **AI (game AI)** | Code that makes characters seem to think: notice you, decide what to do, and do it. Not the chatbot kind. (Lesson 8) |
| **Alpha** | How far we are between the last tick and the next, from 0 to 1. Used to draw smooth motion between ticks. (Lesson 1) |
| **Anisotropic filtering** | A texture setting that keeps floor patterns sharp when you look along them at a shallow angle. |
| **Asset** | Any file the game loads that isn't code: models, sounds, textures, fonts. |
| **Attack token** | A ticket an enemy must hold to shoot at you. Only a few exist, so enemies take turns instead of all firing at once. (Lesson 8) |
| **Awareness** | How sure an enemy is that you're there, from 0 to 1. It fills while they can see you, like a kettle heating; at 1 you're spotted. (Lesson 8) |
| **Bark** | A short callout a character shouts ("Reloading!", "Flanking!") so you can tell what they're doing. (Lesson 8) |
| **Bloom** | Spread that grows with each shot and shrinks back when you stop firing. (Lesson 5) |
| **Bus (audio)** | A mixing channel with one volume knob for a whole group of sounds. (Lesson 7) |
| **Capsule** | A cylinder with rounded ends. A common character shape, which we swapped for a round-edged cylinder (Lesson 3). |
| **CC0** | "No rights reserved": a public-domain licence. Anyone can use the work for anything. All our sounds are CC0. (Lesson 7) |
| **CI (continuous integration)** | GitHub automatically running the tests on every pull request. (Lesson 0) |
| **Collider** | The invisible, simplified shape the physics engine uses for an object. (Lesson 3) |
| **Collision group** | A tag on each collider plus a guest list on each physics question, so (for example) bullets see hitboxes but walking doesn't. (Lesson 10) |
| **Command** | One tick's worth of "what the player wants to do", as a small data object. (Lesson 4) |
| **Compressor** | An automatic volume limiter that stops lots of loud sounds at once from distorting. (Lesson 7) |
| **Cover point** | A spot beside a wall or crate where an enemy can hide: low (crouch behind it) or high (stand behind it). Found when the level loads. (Lesson 9) |
| **Coyote time** | A short grace period after leaving a ledge during which you can still jump. (Lesson 3) |
| **Damage falloff** | Damage getting smaller as the distance to the target grows. (Lesson 5) |
| **Damage indicator** | An arrow on the HUD pointing towards whoever just shot you. (Lesson 10) |
| **Data-driven design** | Describing things (guns, levels) as tables of numbers that the code reads, so they can be changed without changing code. (Lesson 5) |
| **Decal** | A flat picture stuck onto a surface, like a bullet hole. (Lesson 6) |
| **Delta time (dt)** | The time between two updates. Fixed at 1/60 s for our simulation. (Lesson 1) |
| **Determinism** | Same inputs always produce exactly the same result. Required for fair online play and replays. (Lesson 4) |
| **Difficulty** | A set of numbers (enemy damage, reaction time, aim, attack tokens) that makes the same fight easier or harder. (Lesson 10) |
| **Dot product** | A quick calculation of how much two directions agree: 1 the same, 0 sideways, -1 opposite. (Lesson 2) |
| **Draw call** | One "please draw this" request to the graphics card. Fewer is faster. (Lesson 10) |
| **ES module** | A JavaScript file that `import`s what it needs and `export`s what it offers. (Lesson 0) |
| **Event bus** | A shared noticeboard: systems post events and others listen, without knowing about each other. (Lesson 4) |
| **Field of view (FOV)** | How wide the camera sees, in degrees. (Lesson 2) |
| **Fixed timestep** | Updating the world in equal-sized steps whatever the screen's frame rate. (Lesson 1) |
| **Flanking** | Attacking from the side, where someone's cover doesn't protect them. Enemies do it to you; you can do it to them. (Lesson 8) |
| **Frame** | One picture drawn to the screen. |
| **Friction** | In our movement code, how quickly you slow down when you stop pushing. (Lesson 3) |
| **Game loop** | The code that repeats "update the world, draw the world" forever. (Lesson 1) |
| **Garbage collection** | The browser pausing to clean up objects nobody uses any more. Too much of it causes stutters. (Lesson 6) |
| **Grey-box** | Building a level from plain boxes to get gameplay right before adding real art. |
| **Heuristic** | A quick guess that guides a search, like "distance as the crow flies" in A*. (Lesson 9) |
| **Hit zone** | One part of a target (head, body, legs) with its own damage multiplier. (Lesson 5) |
| **Hitbox** | An invisible box on a character that bullets hit: head, body, arms, legs. Separate from the shape it walks with. (Lesson 10) |
| **Hitmarker** | The little ✕ that flashes on the crosshair when you hit something. (Lesson 6) |
| **Hitscan** | Treating a bullet as an instant ray instead of a flying object. (Lesson 5) |
| **HUD** | Heads-up display: the info drawn over the game view (crosshair, speed, ammo later). |
| **Import map** | The part of `index.html` that tells the browser what names like `'three'` mean. (Lesson 0) |
| **Impulse response** | A recording (or code-made imitation) of how a space echoes. Mixing a sound with it adds that echo. (Lesson 7) |
| **Interpolation** | Blending between two known values, such as the last two tick positions. (Lesson 1) |
| **Joint** | A physics connection between two bodies: a ball joint turns any way (a hip), a hinge turns one way (a knee). (Lesson 10) |
| **Juice** | The small reactions (flash, kick, shake, sound) that make an action feel satisfying. (Lesson 6) |
| **Jump buffer** | Remembering a jump pressed slightly too early and doing it on landing. (Lesson 3) |
| **Kinematic character controller** | Physics-engine code that moves a character shape through the world, handling walls and slopes, but without "real" physics pushing it around. (Lesson 3) |
| **Last known position** | Where enemies last saw you. Once you're out of sight they search there, not where you really are. (Lesson 8) |
| **Line of sight** | An unbroken straight line between two points. Checked with a ray: if it hits a wall first, there's no line of sight. (Lesson 8) |
| **Mantle** | Climbing up onto a ledge. (Lesson 3) |
| **Mesh** | A visible 3D shape: geometry (the shape) plus material (how its surface looks). |
| **Muzzle flash** | The burst of light at the end of the barrel when a gun fires. (Lesson 6) |
| **Navigation grid (nav grid)** | A map of every walkable square in a level, with links between squares you can step between. Enemies plan routes on it. (Lesson 9) |
| **Navmesh** | The big-studio version of a nav grid: walkable areas as large polygons instead of small squares. (Lesson 9) |
| **Near miss** | A bullet that passes close to your head without hitting you. You hear it whizz past. (Lesson 10) |
| **Normal** | A length-1 vector pointing straight out of a surface. (Lesson 2) |
| **Normalise** | Scale a vector so its length is exactly 1, keeping its direction. (Lesson 2) |
| **Object pool** | A fixed set of objects made once and reused, instead of creating and deleting them all the time. (Lesson 6) |
| **Panner** | The part of the audio engine that places a sound at a point in 3D space. (Lesson 7) |
| **Pathfinding** | Working out a route from one place to another round obstacles. (Lesson 9) |
| **Penetration** | A bullet passing through a thin surface and carrying on with less damage. (Lesson 5) |
| **Physics engine** | The library that knows the shape of everything and answers "what does this hit?" Ours is Rapier. (Lesson 3) |
| **Pitch / yaw** | Looking up and down / turning left and right. (Lesson 2) |
| **Pointer lock** | The browser feature that hides the cursor and gives raw mouse movement for aiming. |
| **Procedural animation** | Movement made by code from the game's state (speed, aim, crouch) instead of played back from a recording. (Lesson 10) |
| **Projectile** | A real, moving object fired by a weapon (a grenade, a rocket), as opposed to hitscan. (Lesson 5) |
| **Ragdoll** | A character turned into physics boxes joined at the joints, so it falls and tumbles realistically when it goes down. (Lesson 10) |
| **Raycast** | Firing an invisible line and asking what it hits first. Used for mantling, bullets, enemy eyesight and mapping the level. (Lesson 3) |
| **Reaction time** | The delay between an enemy first seeing you and its first shot. (Lesson 8) |
| **Recoil** | The gun kicking your view up and sideways when it fires. You can fight it by pulling the mouse down. (Lesson 6) |
| **Regenerating health** | Health that refills by itself after a few seconds without being hit. (Lesson 10) |
| **Regression test** | A test written for a bug you fixed, so the bug can never quietly return. (Lesson 3) |
| **Render** | Draw the scene to the screen. |
| **Reverb** | Echo added to a sound so it seems to happen in a space. (Lesson 7) |
| **RPM** | Rounds per minute: how fast a gun fires. 600 RPM is 10 shots a second. (Lesson 5) |
| **Seed / seeded random** | A starting number for a random-number generator. The same seed always gives the same sequence. (Lesson 5) |
| **Shadow map** | The scene drawn from the sun's point of view to work out what's in shadow. |
| **Simulation vs presentation** | Code that decides what happens vs code that shows it. Kept separate. (Lesson 4) |
| **Smoke test** | A quick end-to-end check that the whole thing runs at all. (Lesson 0) |
| **Spread** | The cone around your aim inside which a bullet can land. (Lesson 5) |
| **Spring** | Code that pulls a value back to a resting place, overshooting a little. Used for almost all gun and camera motion. (Lesson 6) |
| **Squad** | A group of enemies who share what they know, such as where you were last seen. (Lesson 8) |
| **State machine** | Something that's always in exactly one state, with rules for switching. (Lesson 4) |
| **Step-up** | Climbing small steps automatically while walking. (Lesson 3) |
| **String pulling** | Straightening a zig-zag route by skipping every corner you can walk straight past, like pulling a string tight. (Lesson 9) |
| **Telegraph** | A warning before an attack (a laser, a sound, a wind-up) that gives you a fair chance to react. (Lesson 8) |
| **Tick** | One fixed-size simulation update (1/60 s). (Lesson 1) |
| **Time slicing** | Spreading expensive work over several ticks (each enemy thinks on a different tick) so no single tick is slow. (Lesson 8) |
| **Tone mapping** | Squeezing very bright and dark light into what a screen can show, like a camera's exposure. |
| **Tracer** | A glowing streak showing a bullet's path. (Lesson 6) |
| **Trauma (camera shake)** | A 0-to-1 "how shaken" value that big events add to and time drains. Shake strength is trauma squared. (Lesson 6) |
| **Trigger volume** | An invisible box that notices when you walk into it, like the kill house's start and finish pads. |
| **Tuning** | Adjusting numbers (speeds, timings) until something feels right. (Lesson 3) |
| **Unit test** | An automatic check of one small piece of logic. (Lesson 0) |
| **UV coordinates** | Which part of a texture image goes on which part of a surface. |
| **Vector** | Three numbers (x, y, z) describing a position, direction or velocity. (Lesson 2) |
| **Vendor (verb)** | Keep your own pinned copy of someone else's library in your repo. (Lesson 0) |
| **Vertex colours** | Colours painted onto the corners of a shape instead of an image texture. Lets many coloured boxes share one material. (Lesson 10) |
| **Viewmodel** | The gun and hands drawn in front of you, in their own pass on top of the world. (Lesson 6) |
| **Vision cone** | The area in front of an enemy where it can see, like a torch beam. (Lesson 8) |
| **Warning shot** | A deliberate miss that tells you where you're being shot from before the shots start landing. (Lesson 8) |
| **Web Audio** | The browser's built-in sound engine: a mixing desk of connected nodes. (Lesson 7) |
| **WebAssembly (WASM)** | A fast, compact code format browsers can run. Rapier is written in Rust and compiled to it. |
| **WebGL** | The browser's way of talking to the graphics card. three.js uses it for us. |
