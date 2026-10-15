# Lesson 3: Movement that feels good

**The idea in one sentence:** "good movement" is a handful of simple rules (accelerate, brake, gravity) plus small forgiving tricks, all controlled by numbers you tune by feel.

## The physics engine and colliders

Rapier, our **physics engine**, knows the invisible shape of everything. These shapes are called **colliders**. A detailed crate model is still just a box to the physics engine. Turn on **Debug views → Show colliders** in the tuning panel to see them.

You are an upright cylinder 1.8 m tall and 0.7 m wide, with slightly rounded edges. Each tick, `src/player/controller.js` works out where you *want* to move, then asks Rapier's **character controller**: "if I try to move this cylinder by this much, how far can I actually go?" Rapier answers, sliding you along walls and up gentle slopes.

## Speeding up and slowing down

Two little functions decide how heavy or snappy you feel:

- **`accelerate()`** pushes you towards the speed you want, a little each tick. Higher **Acceleration** means you hit full speed sooner.
- **`applyFriction()`** slows you every tick. Higher **Friction** means you stop sooner when you let go.

This is the classic shooter model from Quake, still the basis of Source and Call of Duty. Walking is 5 m/s, sprinting 7.5 m/s and crouching 2.6 m/s. Sprinting only works going forwards, like most modern shooters.

## Jumping, with a little maths

We set the *jump height* (1.05 m) and let maths find the take-off speed: `speed = √(2 × gravity × height)`. Designers think in heights, so that's the number they tune.

Gravity is 20 m/s², about double real life. Real gravity feels floaty in games because game characters jump far higher than real people. Try 9.8 in the tuning panel and feel the difference.

## Forgiving tricks (they're everywhere in games you love)

- **Coyote time** (`coyoteTime`, 0.12 s): you can still jump just *after* running off an edge, like a cartoon coyote hanging in mid-air. Without it, players swear they pressed jump in time. Often they did, by their reaction time.
- **Jump buffer** (`jumpBuffer`, 0.15 s): pressing jump just *before* landing still jumps when you land.
- **Auto-mantle in the air**: if you jump at a ledge and are pushing forward, you grab it and climb.

Players never notice these. They only notice when a game *doesn't* have them and feels "unresponsive".

## Crouching, sliding and mantling

- **Crouch** shrinks your body to 1.15 m. Before standing back up, the game checks there's room, which is why you can't stand up in the crouch tunnel.
- **Slide**: press C while sprinting. You get a speed boost, then slow down steadily. Downhill, gravity pulls you along: try the **slide hill** next to the tower.
- **Mantle**: the game "drops three invisible sticks" in front of you from above your reach. If one lands on a flat top at a climbable height (0.4 m to 1.35 m above your feet), with room for your body up there, you climb it. If there's only room to crouch, you climb into a crouch.

## A real bug from building this (and how we found it)

When I first wired this up, **the player couldn't climb 0.3 m stairs**. The test said: *"top of 0.3 m stairs: expected 1.2, got 0.02"*. Here's how it went:

1. **Reproduce it in a tiny test world.** A test builds just a floor and four steps, then holds W for three seconds. Fast to run, easy to poke at.
2. **Print what happens each tick.** The player walked up to the first step... and their speed dropped to exactly 0.
3. **Cause #1:** my "slide along walls" code saw the front of the step as a wall and deleted all forward speed, even on ticks where Rapier had already lifted the player up.
4. **Cause #2:** Rapier's built-in step climbing only worked at full walking speed. From a standstill the moves were too small, so it never got started.
5. **Cause #3:** the player was a *capsule* (round bottom), and a round bottom perched on a stair edge slides back off it.
6. **The fix:** a flat-bottomed body (a cylinder with rounded edges) plus our own step-up, the trick Quake and Half-Life use. When something blocks you, try lifting one step height, moving forward and dropping down. If that got you further and you landed on flat ground, it was a step. It's `tryStepUp()` in the controller.
7. **Lock it in:** the test `crouch-walking (slowly) climbs stairs too` makes sure this bug can never come back without us knowing. That's a **regression test**.

That loop (reproduce, measure, find the real cause, fix, add a test) is what professional debugging looks like. It's slower than guessing, and much faster than guessing wrong three times.

## Try this

All in the tuning panel (`` ` ``):

1. **Movement → Friction** to 1: you'll skate like you're on ice. Back to 7 to feel the snappy stop.
2. **Jumping → Coyote time** to 0, then run off the jump-gap platforms and try to jump late. It feels "unfair", even though it's technically correct.
3. **Sliding → Downhill pull** to 0, then try the slide hill. Then 2.
4. **Camera feel → Head bob** to 0.15 m. Too much! Good tuning lives between "lifeless" and "seasick".
5. Find a set you love, click **Copy tuning as text**, and paste it to me. We can make it the new default.

## Common mistakes

- **Tuning several numbers at once.** Change one, play ten seconds, decide. Then the next.
- **Trusting how it feels in slow motion.** Use slow-mo to *see*, then judge at full speed.
