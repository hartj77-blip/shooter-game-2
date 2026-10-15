# Lesson 5: How shooting works

**The idea in one sentence:** when you pull the trigger, the game draws an invisible straight line from your eyes and asks the physics engine what it touches first. Everything else (spread, damage, headshots, shooting through walls) is rules about that line.

## Hitscan: bullets as laser pointers

A real bullet flies at about 900 metres a second, so it crosses our whole map in a tenth of a second. Rather than moving a bullet object frame by frame, the game treats it as instant. It casts a **ray**, an infinitely thin line from a starting point in a direction, and gets back the first collider it touches. That's called **hitscan**: the hit is "scanned" in the same tick you fire.

Slow things you can watch flying (grenades, rockets, arrows) are **projectiles** instead. They're real objects moved by the physics every tick. We'll build those later.

The ray code is in `src/weapons/hitscan.js`, and it's short: `world.castRayAndGetNormal(...)` does the hard part.

## Spread: why bullets don't all go to the dot

If every bullet went exactly to the centre of the screen, guns would be laser-accurate from any distance, while running and jumping. So each bullet gets a small random wobble inside a **cone** around where you're aiming. The size of the cone is the **spread**, in degrees:

- **Hip fire** is wide (2.6° for the carbine); **aiming down the sights** is tight (0.12°).
- **Moving** and **jumping** widen it; **crouching** tightens it.
- **Bloom**: each shot widens it a little more, and it shrinks back when you stop. That's why short bursts are more accurate than holding the trigger.

The crosshair gap on screen shows your real spread. `src/ui/hud.js` converts degrees into pixels with a little trigonometry.

## Seeded randomness: the same "random" everywhere

Spread needs random numbers, but `Math.random()` gives different numbers on every computer. In co-op, your friend's game would disagree about where your bullets went. So we use a **seeded** generator (`src/core/random.js`): start from a number (the seed) and every "random" number after it is decided. Same seed, same sequence, on every machine. It's like two decks of cards shuffled in exactly the same way. A test checks it: same seed means identical shots, and a different seed means a different spray.

## Hit zones and damage

Each target has three invisible colliders, its **hit zones**: head, body and legs. Damage is the gun's damage times the zone's multiplier: **head ×2, body ×1, legs ×0.75** (the shotgun's head multiplier is only ×1.5).

Damage also **falls off** with distance. The carbine does 30 up to 25 m, then less and less until 22 at 60 m and beyond. `damageAt()` in `src/weapons/weapons-data.js` is the whole formula.

## Penetration: shooting through thin walls

When a ray hits wood, the game asks a second question: *how thick is it here?* It starts a new ray a hair *inside* the wall and looks for where it comes out. If the thickness fits the gun's penetration budget (the carbine can punch through 0.6 m of wood), the bullet carries on with less damage. Concrete and steel stop everything.

Try it in the kill house: the wall between the two southern rooms is thin wood, and you can shoot targets through it.

## Guns are rows of numbers

Every gun is one entry in `src/weapons/weapons-data.js`: rate of fire, damage curve, spread, recoil, magazine, reload times, aim zoom and more. The code that runs them (`gun.js`, `arsenal.js`) doesn't know or care which gun it is. Adding a fifth gun means adding a row. Making the shotgun kick harder means changing `recoil.pitch`. This is called **data-driven design**, and it's how studios let designers balance weapons without asking a programmer.

## The order of one tick

```
move (walk, jump, slide)  →  physics step  →  shoot from your new eye position  →  targets react
```

Shooting happens *after* moving so the bullet starts exactly where your eyes are this tick. `src/player/soldier.js` keeps that order. Later, every co-op player will be one of these.

## A real bug from building this

The test *"aiming down the sights slows you down"* failed: walking speed came out at 3.16 m/s instead of 3.01. Printing the aim value every tick showed it flickering between 1.00 and 0.92, every single tick.

The cause was one comparison:

```js
state.ads = target > state.ads ? state.ads + step : state.ads - step;
```

When aim was already at the target (1), `target > state.ads` was false, so the code took the "go down" branch. It moved *away* from where it was supposed to stay, then back up next tick, forever. The fix moves towards the target by at most one step and stops exactly on it:

```js
state.ads += Math.max(-step, Math.min(step, target - state.ads));
```

That's a classic: "move towards" code has to handle *already there*. The test `aim stays fully up while you hold it` now guards it.

## Try this

Open the tuning panel (`` ` ``), go to **Weapons**, and:

1. Tick **Show damage numbers**, then shoot a paper target at 10 m and at 50 m. Watch the numbers drop with distance, and double for headshots.
2. Tick **Show bullet paths** and hip-fire a long burst at the earth bank. Then aim down the sights and do it again.
3. Open **K4 Carbine** and set **Rounds per minute** to 1500. Then set **Bloom per shot** to 0, and try **Penetration** at 0 against the kill house's wooden wall.

## Common mistakes

- **Shooting yourself.** The ray starts inside your own body. We pass the player's collider as "exclude" so rays ignore it.
- **Hitting things that are lying down.** Fallen targets turn their colliders off; otherwise bullets would hit an invisible standing target.
- **Using `Math.random()` in the simulation.** It works, until co-op, when it quietly makes everyone disagree.
