# Lesson 10: Health, hits and bodies

**The idea in one sentence:** being shot has to be readable (where from, how bad, how to recover) and hitting someone has to feel solid, and that takes a few separate tricks: recovering health, damage arrows, hitboxes, collision groups, procedural animation and ragdolls.

## Health that recovers

You have 100 health (`src/player/health.js`). Every hit resets a 4.5-second timer; once it runs out, health refills at 22 a second. It's like a phone that only starts charging once you put it down. Stay in the open and you never recover. Duck into cover and you're back in a few seconds.

This keeps fights moving (one mistake doesn't cripple you for the rest of the mission) and pushes you to use cover, which is the whole point of the enemies' cover game. Our other options were armour plates (tactical, slower) or a few hits and you're out (tense). We picked this one together at the start of the milestone.

## Knowing what hit you

Pillar 3 of the design is *Clear at a glance*. When you're shot:

| Signal | What it tells you |
|---|---|
| **Red screen edges** | How hurt you are. They flash on each hit and deepen as health drops; below 35 the world loses its colour and you hear a heartbeat |
| **A red arrow** round the crosshair | Which way the shot came from. It keeps pointing at the shooter as you turn |
| **A near-miss whizz** | A bullet passed within 1.3 m of your head without hitting you (`bullet:nearmiss`). It's placed in 3D, so you hear which side it went past |
| **A jolt** | The camera flinches sideways |

Before you're shot, white arrows round the crosshair show who's *noticing* you, turning red as their awareness fills. A pulsing red one means a Marksman's laser is on you.

Your ears help too. Enemy gunfire and footsteps are placed in 3D, and far-away sounds are passed through a filter that takes off the treble, because air soaks up high notes over distance. A shot 60 m away is a dull thump; one round the corner is a sharp crack (`play()` in `src/audio/audio.js`).

## Hitboxes and movement bodies

Every soldier, you included, has two invisible shapes:

| Shape | Used for | Why |
|---|---|---|
| A fat cylinder (lesson 3) | Moving | Slides along walls nicely |
| A set of boxes: head, body, arms, legs | Bullets | Shaped like the body, so the zone decides the damage (`src/player/hitboxes.js`) |

If bullets hit the movement cylinder, a shot whistling past someone's ear would hit them.

The boxes follow the body every tick, and crouching swaps them to a crouched set. They match the drawn soldier's pose, standing and crouched. We checked by measuring the model's head position in both poses. *What you see is what you hit.*

## Collision groups: a guest list for every question

With three kinds of shapes in one world (level, movement cylinders, hitboxes), each question to the physics engine needs to see only some of them. Rapier's **collision groups** (`src/world/groups.js`) are a guest list:

| Question | Sees | Doesn't see |
|---|---|---|
| Moving, standing up, mantling | the level, other soldiers | hitboxes (your own legs never trip you) |
| Bullets | the level, hitboxes | movement cylinders |
| Enemy eyesight | the level | soldiers (they don't hide each other) |

Each collider wears a wristband (what it is); each question carries a list of wristbands it lets in. Two numbers packed into one, decided in one file.

## Procedural animation: puppets on strings

The enemies have no animation files. Each block soldier (`src/render/soldier-model.js`) is a puppet: parts nested inside each other, each turning round its own joint:

```
root → hips → thighs → shins
             → torso → head
                     → aim → gun, arms
```

Every frame, a handful of numbers set every joint:
- **stride:** grows with the distance walked; the legs swing on it
- **crouch:** the hips drop, the knees bend, the body leans in
- **aim pitch:** the arms and gun follow the aim up and down
- **ready:** the gun lowered when calm, raised in a fight
- **sprint, reload:** the gun across the chest, or tilted to swap magazines
- **kick and flinch:** springs, stepped in small slices as lesson 6 taught

This is **procedural animation**: motion made by code from the game's state, not played from a recording. It's cheap, it always matches what the soldier is actually doing, and it can be tuned by numbers. Real art (milestone 6) will mix it with recorded animation.

All the boxes that move together are glued into one shape with their colours painted on (`src/render/merge.js`), so a soldier is about 10 draw calls, not 40.

## Ragdolls in a pretend world

When an enemy drops, its puppet turns into a **ragdoll** (`src/render/ragdolls.js`):
- each part becomes a physics box
- **joints** hold them together: ball joints at the waist, neck, hips and shoulders, and hinges at the knees that only bend one way
- the bullet's push is applied at the exact point it hit

Then gravity takes over.

Ragdolls live in a **separate physics world** that holds only a copy of the level's walls and floors. They're decoration, like a film set's breakaway props. They can never block a bullet, trip you up, or make two co-op players' games disagree. The real simulation doesn't know they exist. That's the simulation/presentation split from lesson 4 again, applied to physics.

## Difficulty is just numbers

Recruit, Regular and Veteran (Settings) change four things (`DIFFICULTY` in `src/ai/enemy-data.js`):
1. how much enemy bullets hurt you (30%, 45%, 70% of the gun's damage)
2. how fast enemies react
3. how wild their aim starts
4. how many may shoot at you at once

We tuned Regular by measuring how long you last, with a script that plays the same fight every time:

| Standing in the open at the gate | Recruit | Regular | Veteran |
|---|---|---|---|
| Standing still: down after | 9.9 s | 4.9 s | 2.5 s |
| Strafing side to side: down after | 17.9 s | 10.9 s | 2.7 s |

On Regular the first hit lands about 3 seconds after you step into view (the warning shots come first), and you have about 2 seconds after it to get to cover. Moving more than doubles your time, because enemies track you with a delay. On Veteran, they barely miss.

## Try this

1. In the Compound, tuning panel (`` ` ``) → **AI** → **God mode**. Stand in the courtyard and watch the arrows and the red edges.
2. Third-person camera (Debug views), then shoot an enemy with the shotgun, then with the pistol. Compare the ragdolls.
3. Crouch behind sandbags and peek: do you take hits before you can shoot back?
4. Switch **Difficulty** in Settings and stand in the gate on each.

## Common mistakes

- **Damage with no direction.** A red flash alone says "something hurt you", not "turn left". Always show where.
- **Hitboxes that don't match the model.** Players shoot what they see. Measure both.
- **Ragdolls in the gameplay world.** They block doors and bullets, and differ between computers.
- **Springs stepped once per frame.** They explode on slow machines (lesson 6). Use small steps.
