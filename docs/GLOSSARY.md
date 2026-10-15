# Glossary

Every game-dev term we use, in plain English. New terms get added as each milestone introduces them. The lesson where a term is explained properly is in brackets.

| Term | Meaning |
|---|---|
| **Accumulator** | The "bucket of time" the game loop fills with real time and empties in fixed ticks. (Lesson 1) |
| **Alpha** | How far we are between the last tick and the next, from 0 to 1. Used to draw smooth motion between ticks. (Lesson 1) |
| **Anisotropic filtering** | A texture setting that keeps floor patterns sharp when you look along them at a shallow angle. |
| **Asset** | Any file the game loads that isn't code: models, sounds, textures, fonts. |
| **Capsule** | A cylinder with rounded ends. A common character shape, which we swapped for a round-edged cylinder (Lesson 3). |
| **CI (continuous integration)** | GitHub automatically running the tests on every pull request. (Lesson 0) |
| **Collider** | The invisible, simplified shape the physics engine uses for an object. (Lesson 3) |
| **Command** | One tick's worth of "what the player wants to do", as a small data object. (Lesson 4) |
| **Coyote time** | A short grace period after leaving a ledge during which you can still jump. (Lesson 3) |
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
| **Grey-box** | Building a level from plain boxes to get gameplay right before adding real art. |
| **HUD** | Heads-up display: the info drawn over the game view (crosshair, speed, ammo later). |
| **Import map** | The part of `index.html` that tells the browser what names like `'three'` mean. (Lesson 0) |
| **Interpolation** | Blending between two known values, such as the last two tick positions. (Lesson 1) |
| **Jump buffer** | Remembering a jump pressed slightly too early and doing it on landing. (Lesson 3) |
| **Kinematic character controller** | Physics-engine code that moves a character shape through the world, handling walls and slopes, but without "real" physics pushing it around. (Lesson 3) |
| **Mantle** | Climbing up onto a ledge. (Lesson 3) |
| **Mesh** | A visible 3D shape: geometry (the shape) plus material (how its surface looks). |
| **Normal** | A length-1 vector pointing straight out of a surface. (Lesson 2) |
| **Normalise** | Scale a vector so its length is exactly 1, keeping its direction. (Lesson 2) |
| **Physics engine** | The library that knows the shape of everything and answers "what does this hit?" Ours is Rapier. (Lesson 3) |
| **Pitch / yaw** | Looking up and down / turning left and right. (Lesson 2) |
| **Pointer lock** | The browser feature that hides the cursor and gives raw mouse movement for aiming. |
| **Raycast** | Firing an invisible line and asking what it hits first. Used for mantling now, and bullets later. (Lesson 3) |
| **Regression test** | A test written for a bug you fixed, so the bug can never quietly return. (Lesson 3) |
| **Render** | Draw the scene to the screen. |
| **Shadow map** | The scene drawn from the sun's point of view to work out what's in shadow. |
| **Simulation vs presentation** | Code that decides what happens vs code that shows it. Kept separate. (Lesson 4) |
| **Smoke test** | A quick end-to-end check that the whole thing runs at all. (Lesson 0) |
| **State machine** | Something that's always in exactly one state, with rules for switching. (Lesson 4) |
| **Step-up** | Climbing small steps automatically while walking. (Lesson 3) |
| **Tick** | One fixed-size simulation update (1/60 s). (Lesson 1) |
| **Tone mapping** | Squeezing very bright and dark light into what a screen can show, like a camera's exposure. |
| **Tuning** | Adjusting numbers (speeds, timings) until something feels right. (Lesson 3) |
| **Unit test** | An automatic check of one small piece of logic. (Lesson 0) |
| **UV coordinates** | Which part of a texture image goes on which part of a surface. |
| **Vector** | Three numbers (x, y, z) describing a position, direction or velocity. (Lesson 2) |
| **Vendor (verb)** | Keep your own pinned copy of someone else's library in your repo. (Lesson 0) |
| **WebAssembly (WASM)** | A fast, compact code format browsers can run. Rapier is written in Rust and compiled to it. |
| **WebGL** | The browser's way of talking to the graphics card. three.js uses it for us. |
