# Lesson 17: Supplies, grenades and escorts

**The idea in one sentence:** limited ammo turns every fight into a choice, in co-op every thing has one owner whose word is final, a thrown grenade can be flown by every computer at once, and a hostage is a follower with a simple brain.

## Ammo economy: scarcity makes choices

On the practice maps your spare magazines never run out. In a mission they do: the carbine starts with 30 in the magazine and 120 spare, and that's it until you find more. That one change alters how you play. Do you spray at a shadow, or wait for a clean shot? Do you push on, or go back for ammo? Game designers call this an **ammo economy**: like pocket money, it's only interesting because it runs out.

More comes from **ammo crates** (the boxes with a yellow stripe, seven on the Harbour). Hold F beside one for a second: your spare ammo is full again and you have both grenades back. Each crate has 4 **refills**, shared by the whole squad. The stripe goes grey when it's empty. When you're running low, nearby crates get a marker. A checkpoint remembers how many refills each crate has left, so retrying doesn't refill them.

## Who owns what

In co-op, every piece of the game has an **owner**: the one computer whose word is final about it. It's like a shared house where each chore has one person in charge: no arguments about whether the bins went out.

| Thing | Owner | Why |
|---|---|---|
| **Your ammo** | Your browser | It changes every shot. Waiting to hear from the host would make your gun stutter (lesson 12) |
| **Crate refills** | The host | Two people grabbing the last refill at once: only one can get it |
| **A grenade's flight** | Every computer, separately | See below: they all get the same answer |
| **What a blast does** | The host | Damage is the referee's job |
| **The hostage, the mission, the director** | The host | One truth, sent in snapshots |

### Why "fill to full", not "add 60"

When the host gives you a refill, it sends `ammo:resupply`, and your browser fills its own guns to full. Why not "add 60 rounds"? Because messages can arrive at slightly different moments compared with your shooting. "Add 60" would leave the host's copy and yours a few rounds apart, depending on timing. "Fill to full" gives the same answer whenever it arrives: full is full. Doing something twice, or late, changes nothing. (That property has a name: **idempotent**.)

### Trust, but count

Your browser owns your ammo, so the host can't know your exact count. But it can **check loosely**: it counts the rounds you claim to fire with each gun since your last refill. If that's more than a full load plus a spare magazine, the shot is ignored. Grenades get the same treatment (no more than 2 between refills). Fine for friends. A public game would need more (`docs/DESIGN.md`, open questions).

## Grenades: a projectile everyone can fly

A bullet is **hitscan** (lesson 5): it arrives the instant you fire. A grenade is a **projectile**: an object with a position and a velocity, moved a little every tick, falling under gravity and bouncing off walls (`src/weapons/grenades.js`).

Press **G**: your gun dips, your other hand comes up, and 0.22 s in the grenade leaves your hand (`throwing` in `src/weapons/arsenal.js`). The whole gesture takes 0.6 s and only stops you firing; it doesn't slow you down, because your speed has to be the same on the host and in your browser's prediction.

### Flying it on every computer

Sending a grenade's position 20 times a second would work, but it would look jerky, and it's more data. Instead:

1. Your browser throws it at once (no waiting), and sends the host one message: where it started and how fast it's going, **rounded to the centimetre**.
2. The host flies its own copy from those exact numbers, and tells everyone else (`grenade:throw`), who fly theirs.
3. Grenades only bounce off the **level** (the `LEVEL` group): walls, floors, crates. Never off people, who are in slightly different places on each screen. The level is identical everywhere.

Same starting numbers, same walls, same code: same flight, on every computer, without sending another word. A test flies one throw in two completely separate physics worlds and checks they agree exactly. When it goes off, the host's explosion is the one that counts.

### Area damage with falloff

A blast hurts everything within 7 m: full damage within 1.5 m, then fading to nothing at the edge. That fade is called **falloff**. A wall in between protects you: the blast checks a `LEVEL` ray to each victim's body and head, and if every one is blocked, no damage. It never hurts the squad (friendly fire is off). The demolition charges in Short Fuse use the same code with bigger numbers (11 m, 420 damage).

Enemies who see a grenade land nearby may shout "Grenade!" and run, after their usual reaction time. How likely depends on the role: the Marksman runs 75% of the time, the Rifleman 65%, the Rusher only 45%.

## A real bug: the grenades that went curling

The first grenades bounced nicely, then **slid** about 6 m along the floor after landing, like curling stones. Each bounce kept almost all of the sideways speed, and nothing slowed a grenade rolling along the ground. The bounce test said "comes to rest near the wall", but it came to rest across the room.

The fix was two numbers in `GRENADE`: `grip` (each bounce keeps 45% of the speed along the surface) and `roll` (rolling slows down at 14 m/s²). Real grenades are knobbly lumps of metal, not hockey pucks. It's a **tuning** bug: the code was right, the numbers weren't. That's why they're in a table with sliders (tuning panel → Missions → Grenades).

## Escorts: a follower with a simple brain

The hostage in Lifeline is a soldier with no gun (`src/ai/hostage.js`), in an orange boiler suit. Once freed (hold F for 2 s), they follow whoever freed them, or the nearest standing player if that person goes down. Their brain is a few distance rules:

| Distance from their leader | They... |
|---|---|
| Up to 3.2 m | Stand still: close enough |
| 3.2 to 6.4 m | Walk after you |
| 6.4 to 8 m | Jog |
| 8 to 28 m | Sprint to catch up |
| Over 28 m | Wait where they are, and the HUD says "wait for them" |

They plan a route (lesson 9) at most every half second, and turn it into the same keys an enemy would press (`steer()` and `keysFor()` in `src/ai/enemy.js`).

A few rules keep the escort fair and co-op-safe:

- **Enemies don't aim at them**, but stray bullets hurt (half damage: they keep their head down). **Your** bullets pass through them.
- **Nobody bumps into them.** The hostage's body is in its own collision group (`ESCORT`): players and enemies walk straight through. A follower who shoves you would make your prediction disagree with the host's (lesson 12) all the time.
- **If they go down**, revive them like a teammate (hold F). If they bleed out (45 s), the mission fails.

## Looping sounds

Most sounds play once. The helicopter's rotor plays over and over: a **loop**, like a record on repeat (`loop()` in `src/audio/audio.js`). A loop hands back a handle to move it, change its volume, and **stop it**. If nobody stops it, it carries on into the next map, playing a helicopter over the firing range. The "changing map leaves nothing behind" smoke test starts the helicopter, changes map, and checks no loop is still playing.

The rotor itself is generated by code: a "whup" each time a blade passes (11 a second), over a low engine hum. It's exactly one second long and holds a whole number of whups, so the end joins the start without a click.

## A real bug in a test: the unlucky burst

One of the browser tests ("shooting works") stood at the firing range's 10 m line and fired a short burst from the hip at a target. It failed about one run in eight, on `main` too. Nothing was broken: hip-fire **spread** (lesson 5) is random, and now and then all six shots missed a target that small at that distance. The game behaved as designed; the test was gambling. Moving it to 5 m from the target made a miss practically impossible: 12 runs out of 12 passed. **A test that depends on luck isn't testing your code.** Make it certain, or seed the random.

The two-tab rescue test had a cousin of that bug. It passed on this computer, then failed on GitHub: the friend held W, and the hostage never moved. Each game picks the hostage's building at random, and GitHub's run got the net shed. The friend, facing whichever way they happened to face, walked straight into the shed's wall and stopped within 3.2 m of the hostage: "close enough", so the hostage stayed put, exactly as designed. Running the old test six times failed every time the net shed came up, and passed for the smokehouse. Now the test sends the friend to the building's safe spot outside, which the map's tests prove can be reached, and it passes for all three buildings.

## Try this

1. Play a mission and count how many crate refills you need. Then try finishing with only one.
2. Tuning panel → Missions → Grenades: set **Bounciness** to 0.9 and **Slide kept per bounce** to 1 and throw one down a corridor. Then put them back.
3. Throw a grenade round a corner at a frozen enemy (Tuning panel → AI → Freeze enemies), then one with a wall in the way.
4. In Lifeline, free the hostage and sprint away. Watch them run, then stop and wait when you're too far.
5. In the console during a mission: `fireteam.audio.loops` (0, or 1 while the helicopter is in the air).

## Common mistakes

- **"Add 60" instead of "fill to full".** Two computers drift apart with timing.
- **Projectiles that bounce off players.** Players aren't in exactly the same place on every screen, so the flights disagree.
- **Area damage through walls.** Without a line-of-sight check, a grenade behind a concrete wall still kills you.
- **A follower that blocks doorways.** Give escorts their own collision group.
- **Starting a loop and forgetting it.** Every loop needs someone responsible for stopping it.
- **Tests that pass on luck.** Seed it, or make the outcome certain.
