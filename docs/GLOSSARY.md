# Glossary

Every game-dev term we use, in plain English. New terms get added as each milestone introduces them. The lesson where a term is explained properly is in brackets.

| Term | Meaning |
|---|---|
| **Accumulator** | The "bucket of time" the game loop fills with real time and empties in fixed ticks. (Lesson 1) |
| **ADS (aim down sights)** | Raising the gun to your eye to aim through its sights: tighter spread and a zoomed view, but you move slower. (Lesson 6) |
| **Alpha** | How far we are between the last tick and the next, from 0 to 1. Used to draw smooth motion between ticks. (Lesson 1) |
| **Anisotropic filtering** | A texture setting that keeps floor patterns sharp when you look along them at a shallow angle. |
| **Asset** | Any file the game loads that isn't code: models, sounds, textures, fonts. |
| **Bloom** | Spread that grows with each shot and shrinks back when you stop firing. (Lesson 5) |
| **Bus (audio)** | A mixing channel with one volume knob for a whole group of sounds. (Lesson 7) |
| **Capsule** | A cylinder with rounded ends. A common character shape, which we swapped for a round-edged cylinder (Lesson 3). |
| **CC0** | "No rights reserved": a public-domain licence. Anyone can use the work for anything. All our sounds are CC0. (Lesson 7) |
| **CI (continuous integration)** | GitHub automatically running the tests on every pull request. (Lesson 0) |
| **Collider** | The invisible, simplified shape the physics engine uses for an object. (Lesson 3) |
| **Command** | One tick's worth of "what the player wants to do", as a small data object. (Lesson 4) |
| **Compressor** | An automatic volume limiter that stops lots of loud sounds at once from distorting. (Lesson 7) |
| **Coyote time** | A short grace period after leaving a ledge during which you can still jump. (Lesson 3) |
| **Damage falloff** | Damage getting smaller as the distance to the target grows. (Lesson 5) |
| **Data-driven design** | Describing things (guns, levels) as tables of numbers that the code reads, so they can be changed without changing code. (Lesson 5) |
| **Decal** | A flat picture stuck onto a surface, like a bullet hole. (Lesson 6) |
| **Delta time (dt)** | The time between two updates. Fixed at 1/60 s for our simulation. (Lesson 1) |
| **Determinism** | Same inputs always produce exactly the same result. Required for fair online play and replays. (Lesson 4) |
| **Dot product** | A quick calculation of how much two directions agree: 1 the same, 0 sideways, -1 opposite. (Lesson 2) |
| **Draw call** | One "please draw this" request to the graphics card. Fewer is faster. (Milestone 6) |
| **ES module** | A JavaScript file that `import`s what it needs and `export`s what it offers. (Lesson 0) |
| **Event bus** | A shared noticeboard: systems post events and others listen, without knowing about each other. (Lesson 4) |
| **Field of view (FOV)** | How wide the camera sees, in degrees. (Lesson 2) |
| **Fixed timestep** | Updating the world in equal-sized steps whatever the screen's frame rate. (Lesson 1) |
| **Frame** | One picture drawn to the screen. |
| **Friction** | In our movement code, how quickly you slow down when you stop pushing. (Lesson 3) |
| **Game loop** | The code that repeats "update the world, draw the world" forever. (Lesson 1) |
| **Garbage collection** | The browser pausing to clean up objects nobody uses any more. Too much of it causes stutters. (Lesson 6) |
| **Grey-box** | Building a level from plain boxes to get gameplay right before adding real art. |
| **Hit zone** | One part of a target (head, body, legs) with its own damage multiplier. (Lesson 5) |
| **Hitmarker** | The little ✕ that flashes on the crosshair when you hit something. (Lesson 6) |
| **Hitscan** | Treating a bullet as an instant ray instead of a flying object. (Lesson 5) |
| **HUD** | Heads-up display: the info drawn over the game view (crosshair, speed, ammo later). |
| **Import map** | The part of `index.html` that tells the browser what names like `'three'` mean. (Lesson 0) |
| **Impulse response** | A recording (or code-made imitation) of how a space echoes. Mixing a sound with it adds that echo. (Lesson 7) |
| **Interpolation** | Blending between two known values, such as the last two tick positions. (Lesson 1) |
| **Juice** | The small reactions (flash, kick, shake, sound) that make an action feel satisfying. (Lesson 6) |
| **Jump buffer** | Remembering a jump pressed slightly too early and doing it on landing. (Lesson 3) |
| **Kinematic character controller** | Physics-engine code that moves a character shape through the world, handling walls and slopes, but without "real" physics pushing it around. (Lesson 3) |
| **Mantle** | Climbing up onto a ledge. (Lesson 3) |
| **Mesh** | A visible 3D shape: geometry (the shape) plus material (how its surface looks). |
| **Muzzle flash** | The burst of light at the end of the barrel when a gun fires. (Lesson 6) |
| **Normal** | A length-1 vector pointing straight out of a surface. (Lesson 2) |
| **Normalise** | Scale a vector so its length is exactly 1, keeping its direction. (Lesson 2) |
| **Object pool** | A fixed set of objects made once and reused, instead of creating and deleting them all the time. (Lesson 6) |
| **Panner** | The part of the audio engine that places a sound at a point in 3D space. (Lesson 7) |
| **Penetration** | A bullet passing through a thin surface and carrying on with less damage. (Lesson 5) |
| **Physics engine** | The library that knows the shape of everything and answers "what does this hit?" Ours is Rapier. (Lesson 3) |
| **Pitch / yaw** | Looking up and down / turning left and right. (Lesson 2) |
| **Pointer lock** | The browser feature that hides the cursor and gives raw mouse movement for aiming. |
| **Projectile** | A real, moving object fired by a weapon (a grenade, a rocket), as opposed to hitscan. (Lesson 5) |
| **Raycast** | Firing an invisible line and asking what it hits first. Used for mantling now, and bullets later. (Lesson 3) |
| **Recoil** | The gun kicking your view up and sideways when it fires. You can fight it by pulling the mouse down. (Lesson 6) |
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
| **State machine** | Something that's always in exactly one state, with rules for switching. (Lesson 4) |
| **Step-up** | Climbing small steps automatically while walking. (Lesson 3) |
| **Tick** | One fixed-size simulation update (1/60 s). (Lesson 1) |
| **Tone mapping** | Squeezing very bright and dark light into what a screen can show, like a camera's exposure. |
| **Tracer** | A glowing streak showing a bullet's path. (Lesson 6) |
| **Trauma (camera shake)** | A 0-to-1 "how shaken" value that big events add to and time drains. Shake strength is trauma squared. (Lesson 6) |
| **Trigger volume** | An invisible box that notices when you walk into it, like the kill house's start and finish pads. |
| **Tuning** | Adjusting numbers (speeds, timings) until something feels right. (Lesson 3) |
| **Unit test** | An automatic check of one small piece of logic. (Lesson 0) |
| **UV coordinates** | Which part of a texture image goes on which part of a surface. |
| **Vector** | Three numbers (x, y, z) describing a position, direction or velocity. (Lesson 2) |
| **Vendor (verb)** | Keep your own pinned copy of someone else's library in your repo. (Lesson 0) |
| **Viewmodel** | The gun and hands drawn in front of you, in their own pass on top of the world. (Lesson 6) |
| **Web Audio** | The browser's built-in sound engine: a mixing desk of connected nodes. (Lesson 7) |
| **WebAssembly (WASM)** | A fast, compact code format browsers can run. Rapier is written in Rust and compiled to it. |
| **WebGL** | The browser's way of talking to the graphics card. three.js uses it for us. |
