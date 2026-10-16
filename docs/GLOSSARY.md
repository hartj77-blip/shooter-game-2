# Glossary

Every game-dev term we use, in plain English. New terms get added as each milestone introduces them. The lesson where a term is explained properly is in brackets.

| Term | Meaning |
|---|---|
| **A\* ("A star")** | The route-finding method enemies use: always explore next the square that looks most promising (distance so far + distance still to go). Like a sat-nav. (Lesson 9) |
| **Accumulator** | The "bucket of time" the game loop fills with real time and empties in fixed ticks. (Lesson 1) |
| **Ack (acknowledge)** | The number of your last command the host has used. Snapshots carry it back, so your browser knows which of its guesses to check. (Lesson 12) |
| **ADS (aim down sights)** | Raising the gun to your eye to aim through its sights: tighter spread and a zoomed view, but you move slower. (Lesson 6) |
| **AI (game AI)** | Code that makes characters seem to think: notice you, decide what to do, and do it. Not the chatbot kind. (Lesson 8) |
| **Alpha** | How far we are between the last tick and the next, from 0 to 1. Used to draw smooth motion between ticks. (Lesson 1) |
| **Ammo economy** | How much ammo you have against how much you need. Scarce ammo makes every shot a choice; crates are where more comes from. (Lesson 17) |
| **Analyser (audio)** | A Web Audio node that measures a sound from moment to moment. We use it to light up whoever's talking. (Lesson 13) |
| **Anisotropic filtering** | A texture setting that keeps floor patterns sharp when you look along them at a shallow angle. |
| **App shell** | The part of the game that lives as long as the page (renderer, sound, input, menus, the room), as opposed to a mission, which is one map. (Lesson 11) |
| **Area damage** | Damage to everything within a radius, like a grenade's blast, rather than to one thing a bullet hit. (Lesson 17) |
| **Asset** | Any file the game loads that isn't code: models, sounds, textures, fonts. |
| **Attack token** | A ticket an enemy must hold to shoot at you. Only a few exist, so enemies take turns instead of all firing at once. (Lesson 8) |
| **Authoritative host** | The one computer whose version of the game is the truth. Everyone else's is a copy. Our host is the referee. (Lesson 11) |
| **Awareness** | How sure an enemy is that you're there, from 0 to 1. It fills while they can see you, like a kettle heating; at 1 you're spotted. (Lesson 8) |
| **Band-pass filter** | A sound filter that keeps only a middle range of frequencies. 300 to 3,400 Hz is what makes a voice sound like an old radio. (Lesson 13) |
| **Bandwidth** | How much data you can send per second: how wide the pipe is. A co-op game uses about 28 KB/s per player. (Lesson 11) |
| **Bark** | A short callout a character shouts ("Reloading!", "Flanking!") so you can tell what they're doing. (Lesson 8) |
| **Batching** | Joining many meshes that share a material into one, so they cost one draw call instead of many. One trolley per shop. (Lesson 16) |
| **Bleed out** | In co-op, the 30 seconds you have after going down before you're out until the next fight, unless a teammate revives you. (Lesson 11) |
| **Blockout** | A map built from rough grey shapes, to test routes and fights before any art is made. (Lesson 16) |
| **Bloom** | Spread that grows with each shot and shrinks back when you stop firing. (Lesson 5) |
| **Build-up, peak, relax** | The director's rhythm: send enemies while things are calm, back off when you're under pressure, then give you a breather. (Lesson 15) |
| **Bus (audio)** | A mixing channel with one volume knob for a whole group of sounds. (Lesson 7) |
| **Callsign** | Your name in a co-op game. (Lesson 11) |
| **Capsule** | A cylinder with rounded ends. A common character shape, which we swapped for a round-edged cylinder (Lesson 3). |
| **CC0** | "No rights reserved": a public-domain licence. Anyone can use the work for anything. All our sounds are CC0. (Lesson 7) |
| **Checkpoint** | A saved moment in a mission (after each step). If everyone goes down, you retry from there instead of the start. (Lesson 14) |
| **Choke point** | A narrow place where routes meet (a gate, a doorway), where fights tend to happen. (Lesson 16) |
| **CI (continuous integration)** | GitHub automatically running the tests on every pull request. (Lesson 0) |
| **Client** | In co-op, a player's browser that isn't the host: it sends its commands and shows the world from snapshots. (Lesson 11) |
| **Client-side prediction** | Your browser moving your soldier straight away, guessing what the host will say, instead of waiting for it. (Lesson 12) |
| **Collider** | The invisible, simplified shape the physics engine uses for an object. (Lesson 3) |
| **Collision group** | A tag on each collider plus a guest list on each physics question, so (for example) bullets see hitboxes but walking doesn't. (Lesson 10) |
| **Command** | One tick's worth of "what the player wants to do", as a small data object. (Lesson 4) |
| **Compressor** | An automatic volume limiter that stops lots of loud sounds at once from distorting. (Lesson 7) |
| **Contested** | Progress that pauses while enemies are close and none of you are, like a tug of war. (Lesson 14) |
| **Cover point** | A spot beside a wall or crate where an enemy can hide: low (crouch behind it) or high (stand behind it). Found when the level loads. (Lesson 9) |
| **Coyote time** | A short grace period after leaving a ledge during which you can still jump. (Lesson 3) |
| **Crescendo** | The finale of a mission: once the helicopter is called, the director sends waves whatever happens. (Lesson 15) |
| **Culling** | Skipping things the camera can't see, so they cost nothing to draw. Batching per tile keeps it working on a big map. (Lesson 16) |
| **Damage falloff** | Damage getting smaller as the distance to the target grows. (Lesson 5) |
| **Damage indicator** | An arrow on the HUD pointing towards whoever just shot you. (Lesson 10) |
| **Data channel** | A WebRTC connection for any messages we like (our commands, snapshots and events), next to the audio and video ones. (Lesson 13) |
| **Data-driven design** | Describing things (guns, levels) as tables of numbers that the code reads, so they can be changed without changing code. (Lesson 5) |
| **Debrief** | The screen after a mission: how it went, the time, each objective and everyone's numbers. (Lesson 14) |
| **Decal** | A flat picture stuck onto a surface, like a bullet hole. (Lesson 6) |
| **Delta time (dt)** | The time between two updates. Fixed at 1/60 s for our simulation. (Lesson 1) |
| **Determinism** | Same inputs always produce exactly the same result. Required for fair online play and replays. (Lesson 4) |
| **Difficulty** | A set of numbers (enemy damage, reaction time, aim, attack tokens) that makes the same fight easier or harder. (Lesson 10) |
| **Director** | The code that decides when reinforcements arrive and when you get a breather, from how hard the fight is for you. (Lesson 15) |
| **Dot product** | A quick calculation of how much two directions agree: 1 the same, 0 sideways, -1 opposite. (Lesson 2) |
| **Draw call** | One "please draw this" request to the graphics card. Fewer is faster: like shopping trips, the travel costs more than the shopping. (Lessons 10, 16) |
| **Echo cancellation** | Removing the sound of your own speakers from your microphone, so teammates don't hear themselves. Headphones work better. (Lesson 13) |
| **Entry point** | A place at the edge of the map where reinforcements arrive (a gate, a jetty), with a route they run in along. (Lesson 15) |
| **Escort** | Protecting someone who moves with you, like the hostage. (Lesson 17) |
| **ES module** | A JavaScript file that `import`s what it needs and `export`s what it offers. (Lesson 0) |
| **Event bus** | A shared noticeboard: systems post events and others listen, without knowing about each other. (Lesson 4) |
| **Extraction** | Getting out at the end of a mission: call the helicopter, survive until it lands, get aboard. (Lesson 14) |
| **Falloff** | How damage (or loudness, or light) fades with distance. A grenade does full damage close up, nothing at the edge. (Lesson 17) |
| **Favour the shooter** | Letting the shooter's own browser decide what their bullets hit, so you hit what you saw. Fine among friends; cheatable by strangers. (Lesson 12) |
| **Field of view (FOV)** | How wide the camera sees, in degrees. (Lesson 2) |
| **Fixed timestep** | Updating the world in equal-sized steps whatever the screen's frame rate. (Lesson 1) |
| **Flanking** | Attacking from the side, where someone's cover doesn't protect them. Enemies do it to you; you can do it to them. (Lesson 8) |
| **Follower** | A character who follows someone: keeps a few metres behind, runs to catch up, waits if left too far behind. (Lesson 17) |
| **Frame** | One picture drawn to the screen. |
| **Friction** | In our movement code, how quickly you slow down when you stop pushing. (Lesson 3) |
| **Fuse** | The delay between throwing a grenade (or planting a charge) and the bang. (Lesson 17) |
| **Game loop** | The code that repeats "update the world, draw the world" forever. (Lesson 1) |
| **Garbage collection** | The browser pausing to clean up objects nobody uses any more. Too much of it causes stutters. (Lesson 6) |
| **Getter** | A property that runs a small function each time it's read, so it's always up to date. `Object.assign` copies its answer once, not the getter. (Lesson 14) |
| **Grey-box** | Building a level from plain boxes to get gameplay right before adding real art. |
| **Heuristic** | A quick guess that guides a search, like "distance as the crow flies" in A*. (Lesson 9) |
| **Hit claim** | A client telling the host "I shot this enemy, here, for this much". The host checks it loosely, then applies it. (Lesson 12) |
| **Hit zone** | One part of a target (head, body, legs) with its own damage multiplier. (Lesson 5) |
| **Hitbox** | An invisible box on a character that bullets hit: head, body, arms, legs. Separate from the shape it walks with. (Lesson 10) |
| **Hitmarker** | The little ✕ that flashes on the crosshair when you hit something. (Lesson 6) |
| **Hitscan** | Treating a bullet as an instant ray instead of a flying object. (Lesson 5) |
| **Hole punching** | Two browsers behind home routers sending to each other at the same moment, so each router lets the other in. (Lesson 13) |
| **Host** | In co-op, the browser that runs the real game (the referee). Solo play is hosting a game for one. (Lesson 11) |
| **HUD** | Heads-up display: the info drawn over the game view (crosshair, speed, ammo later). |
| **Idempotent** | Gives the same result however many times you do it. "Fill to full" is; "add 60" isn't. (Lesson 17) |
| **Import map** | The part of `index.html` that tells the browser what names like `'three'` mean. (Lesson 0) |
| **Impulse response** | A recording (or code-made imitation) of how a space echoes. Mixing a sound with it adds that echo. (Lesson 7) |
| **Intensity** | The director's stress meter for each player, 0 to 1: up when you're hurt or shot at, draining when it's quiet. (Lesson 15) |
| **Interpolation** | Blending between two known values: the last two tick positions when drawing (Lesson 1), or the two snapshots either side of "0.1 s ago" for other players in co-op (Lesson 11). |
| **Island (nav grid)** | A connected piece of the walkable map. Two places on the same island can be walked between, however far apart. (Lesson 16) |
| **Jitter** | Delay that changes from packet to packet, like buses arriving in clumps. (Lesson 11) |
| **Jitter buffer** | A small waiting room for incoming commands (about two), so the host always has one ready even when packets bunch up. (Lesson 12) |
| **Joint** | A physics connection between two bodies: a ball joint turns any way (a hip), a hinge turns one way (a knee). (Lesson 10) |
| **Juice** | The small reactions (flash, kick, shake, sound) that make an action feel satisfying. (Lesson 6) |
| **Jump buffer** | Remembering a jump pressed slightly too early and doing it on landing. (Lesson 3) |
| **Key moment (set piece)** | A scripted event written into a mission: "when the download starts, a truck arrives at the east road". (Lesson 15) |
| **Kinematic character controller** | Physics-engine code that moves a character shape through the world, handling walls and slopes, but without "real" physics pushing it around. (Lesson 3) |
| **Landmark** | Something big and unique you can see from far away (a crane, a lighthouse), so you always know where you are. (Lesson 16) |
| **Last known position** | Where enemies last saw you. Once you're out of sight they search there, not where you really are. (Lesson 8) |
| **Latch** | A switch that stays set until something resets it. After a hold-F finishes, you must let go of F before starting another. (Lesson 14) |
| **Latency** | How long a message takes to get somewhere. (Lesson 11) |
| **Line of sight** | An unbroken straight line between two points. Checked with a ray: if it hits a wall first, there's no line of sight. (Lesson 8) |
| **Lobby** | Where players gather before (and during) a co-op game: room code, who's in, the host's choices, Start. (Lesson 11) |
| **Loop (sound)** | A sound that plays over and over until stopped, like the helicopter's rotor. Whoever starts one must stop it. (Lesson 17) |
| **LZ (landing zone)** | Where the helicopter lands to take you home. (Lesson 14) |
| **Mantle** | Climbing up onto a ledge. (Lesson 3) |
| **Mesh (3D)** | A visible 3D shape: geometry (the shape) plus material (how its surface looks). |
| **Mesh (network)** | Everyone connected directly to everyone. Our voice chat is a mesh; four players make six links. (Lesson 13) |
| **Mission (in our code)** | One map, built and ready to play, with its own event noticeboard; dispose() tears it down without reloading the page. (Lesson 11) |
| **Muzzle flash** | The burst of light at the end of the barrel when a gun fires. (Lesson 6) |
| **NAT** | Network address translation: your router sharing one public internet address between every device in the house, like a block of flats with one street address. (Lesson 13) |
| **Navigation grid (nav grid)** | A map of every walkable square in a level, with links between squares you can step between. Enemies plan routes on it. (Lesson 9) |
| **Navmesh** | The big-studio version of a nav grid: walkable areas as large polygons instead of small squares. (Lesson 9) |
| **Near miss** | A bullet that passes close to your head without hitting you. You hear it whizz past. (Lesson 10) |
| **Normal** | A length-1 vector pointing straight out of a surface. (Lesson 2) |
| **Normalise** | Scale a vector so its length is exactly 1, keeping its direction. (Lesson 2) |
| **Objective** | A job in a mission: free the hostage, download the files, destroy the caches, hold the area. Each is a small state machine. (Lesson 14) |
| **Object pool** | A fixed set of objects made once and reused, instead of creating and deleting them all the time. (Lesson 6) |
| **Owner (co-op)** | The one computer whose word is final about something: your browser for your ammo, the host for crates and explosions. (Lesson 17) |
| **Pacing** | The rhythm of a game: when it's tense, when it's quiet. (Lesson 15) |
| **Packet** | One small parcel of data sent across the internet. Big messages are split into several. (Lesson 11) |
| **Packet loss** | Packets that never arrive. (Lesson 11) |
| **Panner** | The part of the audio engine that places a sound at a point in 3D space. (Lesson 7) |
| **Pathfinding** | Working out a route from one place to another round obstacles. (Lesson 9) |
| **Peer-to-peer** | Players' computers connecting straight to each other instead of to a company's game server. (Lesson 13) |
| **Penetration** | A bullet passing through a thin surface and carrying on with less damage. (Lesson 5) |
| **Physics engine** | The library that knows the shape of everything and answers "what does this hit?" Ours is Rapier. (Lesson 3) |
| **Ping (latency)** | How long a message takes to get there and back, in milliseconds. Shown in the lobby. (Lesson 11) |
| **Ping (marker)** | Pointing something out to your squad: Z marks the enemy or spot you're aiming at, for everyone. (Lesson 11) |
| **Pitch / yaw** | Looking up and down / turning left and right. (Lesson 2) |
| **Pointer lock** | The browser feature that hides the cursor and gives raw mouse movement for aiming. |
| **Procedural animation** | Movement made by code from the game's state (speed, aim, crouch) instead of played back from a recording. (Lesson 10) |
| **Projectile** | A real, moving object fired by a weapon (a grenade, a rocket), as opposed to hitscan. Our grenades are flown by every co-op computer at once. (Lessons 5, 17) |
| **Proxy (stand-in)** | On a client, a puppet for another soldier, moved to wherever the snapshots say, with hitboxes so your bullets can hit it. (Lesson 11) |
| **Push-to-talk** | Your microphone only sends while you hold a key (V). (Lesson 13) |
| **Quantization** | Rounding numbers on purpose (positions to the centimetre) so they take less space to send. (Lesson 11) |
| **Ragdoll** | A character turned into physics boxes joined at the joints, so it falls and tumbles realistically when it goes down. (Lesson 10) |
| **Raycast** | Firing an invisible line and asking what it hits first. Used for mantling, bullets, enemy eyesight and mapping the level. (Lesson 3) |
| **Reaction time** | The delay between an enemy first seeing you and its first shot. (Lesson 8) |
| **Recoil** | The gun kicking your view up and sideways when it fires. You can fight it by pulling the mouse down. (Lesson 6) |
| **Reconciliation** | When the host's answer differs from your prediction: go back to the host's answer and quickly replay your newer commands. (Lesson 12) |
| **Regenerating health** | Health that refills by itself after a few seconds without being hit. (Lesson 10) |
| **Regression test** | A test written for a bug you fixed, so the bug can never quietly return. (Lesson 3) |
| **Reinforcements** | Enemies who arrive during a mission, sent by the director, on top of the ones already there (the garrison). (Lesson 15) |
| **Reliable message** | Guaranteed to arrive, in order, resent if lost: a recorded letter. Used for events and the lobby. (Lesson 11) |
| **Render** | Draw the scene to the screen. |
| **Resupply** | Refilling your spare ammo and grenades, at an ammo crate. (Lesson 17) |
| **Retry** | Going back to the last checkpoint after a mission fails: guards you dealt with stay gone, the rest are calm again. (Lesson 14) |
| **Reverb** | Echo added to a sound so it seems to happen in a space. (Lesson 7) |
| **Revive** | Getting a downed teammate back up: hold F next to them for 3 seconds. (Lesson 11) |
| **Room code** | Five letters (no I, L or O) that friends type to join your game. (Lesson 11) |
| **RPM** | Rounds per minute: how fast a gun fires. 600 RPM is 10 shots a second. (Lesson 5) |
| **Seed / seeded random** | A starting number for a random-number generator. The same seed always gives the same sequence. (Lesson 5) |
| **Shadow map** | The scene drawn from the sun's point of view to work out what's in shadow. |
| **Sightline** | How far you can see (and be seen) in a straight line. Long ones suit snipers, short ones close fights. (Lesson 16) |
| **Signalling** | Swapping the details two browsers need before they can connect directly, through a matchmaking service. (Lesson 13) |
| **Simulation vs presentation** | Code that decides what happens vs code that shows it. Kept separate. (Lesson 4) |
| **Smoke test** | A quick end-to-end check that the whole thing runs at all. (Lesson 0) |
| **Snapshot** | A description of the world (where everyone is, how they're doing) that the host sends 20 times a second. (Lesson 11) |
| **Spectate** | Watching a teammate (over their shoulder) after you're out. (Lesson 11) |
| **Spread** | The cone around your aim inside which a bullet can land. (Lesson 5) |
| **Spring** | Code that pulls a value back to a resting place, overshooting a little. Used for almost all gun and camera motion. (Lesson 6) |
| **Squad** | A group of enemies who share what they know, such as where you were last seen. (Lesson 8) |
| **Stage** | One step of a mission ("rescue", then "extract"). Finishing one saves a checkpoint. (Lesson 14) |
| **Star (network)** | Everyone connected to one computer in the middle. Our game data is a star round the host. (Lesson 11) |
| **State machine** | Something that's always in exactly one state, with rules for switching. (Lesson 4) |
| **Step-up** | Climbing small steps automatically while walking. (Lesson 3) |
| **String pulling** | Straightening a zig-zag route by skipping every corner you can walk straight past, like pulling a string tight. (Lesson 9) |
| **STUN** | A server that tells your browser what its public internet address looks like from outside. (Lesson 13) |
| **Telegraph** | A warning before an attack (a laser, a sound, a wind-up) that gives you a fair chance to react. (Lesson 8) |
| **Tick** | One fixed-size simulation update (1/60 s). (Lesson 1) |
| **Tile** | A square of the map (32 m on a side) whose level pieces are batched together, so a whole tile can be skipped when it's out of view. (Lesson 16) |
| **Time slicing** | Spreading expensive work over several ticks (each enemy thinks on a different tick) so no single tick is slow. (Lesson 8) |
| **Tone mapping** | Squeezing very bright and dark light into what a screen can show, like a camera's exposure. |
| **Tracer** | A glowing streak showing a bullet's path. (Lesson 6) |
| **Trauma (camera shake)** | A 0-to-1 "how shaken" value that big events add to and time drains. Shake strength is trauma squared. (Lesson 6) |
| **Trigger volume** | An invisible box that notices when you walk into it, like the kill house's start and finish pads. |
| **Tuning** | Adjusting numbers (speeds, timings) until something feels right. (Lesson 3) |
| **TURN** | A relay server that passes everything along when two browsers can't connect directly. (Lesson 13) |
| **Unit test** | An automatic check of one small piece of logic. (Lesson 0) |
| **Unreliable message** | Sent once; may be lost or overtaken: a shout across a room. Used for snapshots and commands, because a newer one is always on its way. (Lesson 11) |
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
| **WebRTC** | The video-call technology built into browsers: direct audio, video and data between two browsers. (Lesson 13) |
