# Lesson 8: How enemies think

**The idea in one sentence:** an enemy is a soldier exactly like you, the same body and the same guns, whose "keyboard" is a small program that looks, listens, decides what it wants, and presses the buttons for it.

## Same body, different driver

Your soldier gets a **command** each tick from the keyboard and mouse: move forwards, aim here, fire. An enemy gets exactly the same kind of command, but it's made by code (`command()` in `src/ai/enemy.js`). Same controller, same guns, same rules. Nothing is faked: enemies can't walk through walls, their guns have spread and recoil, and they reload.

This matters for three reasons:
- **Fairness.** You can trust that they play by your rules.
- **Less code.** One movement system, one gun system.
- **Co-op later.** In milestone 4 your friends' soldiers are driven by commands from the network. Same idea again.

## A brain is a state machine

Picture a guard dog. It's always in exactly one mood:

- *Dozing:* **patrol** or **guard**
- *Ears up:* **suspicious**
- *Sniffing about:* **investigate**, **search**
- *Chasing:* **combat**

Each mood has its own rules for what to do and when to switch. That's a **state machine** (`src/core/fsm.js`, from lesson 4), and `src/ai/brain.js` is one per enemy:

```
calm:    patrol / guard ─(noise, glimpse)─▶ suspicious ─▶ investigate ─▶ search ─▶ back to calm
combat:  engage ─▶ toCover ─▶ inCover (peek, shoot, duck, reload)
                 ├▶ flank   (circle round to your side)
                 ├▶ rush    (charge: Rushers)
                 ├▶ perch   (hold a high spot: Marksmen)
                 └▶ fight   (no cover nearby: strafe and shoot)
         lost you for a while ─▶ hunt (go where you were last seen) ─▶ search ─▶ calm
```

The brain only decides **what it wants**: where to go, how fast, crouched or standing, what to look at, whether shooting is OK. The "motor" in `enemy.js` handles the hands and feet:
- walking the route
- turning at a human speed
- aiming with a human's mistakes
- pulling the trigger in bursts

Keeping "wanting" separate from "doing" keeps each part simple.

## Senses: a torch beam and a kettle

**Sight** is a cone, like a torch beam (`src/ai/senses.js`). You can be seen if you're:
1. within the role's sight range,
2. inside the cone, or the wider "corner of the eye" cone, which counts less, and
3. visible along an invisible ray from their eyes to your head or chest that doesn't hit a wall. That's **line of sight**.

Being seen isn't the same as being *spotted*. **Awareness** fills like a kettle heating up:

| Faster | Slower |
|---|---|
| close | far |
| in the middle of their view | in the corner of their eye |
| moving, sprinting | crouched, standing still |
| you just fired | |

At 1.0 the kettle boils: they've spotted you, shout "Contact!", and the fight starts. Out of sight, it cools down again. That's what makes sneaking possible. Above 0.35 they're **suspicious**: a **?** appears over their head, and an arrow round your crosshair shows who's noticing you.

**Hearing** works through a noticeboard (`src/ai/noise.js`). Gunshots, footsteps and landings post a note saying where the noise happened and how far it carries:

| Noise | Heard up to |
|---|---|
| Gunshot | 70 m |
| Sprinting | 14 m |
| Walking | 6 m |
| Crouch-walking | 1.5 m |

Walls halve the distance. A gunshot heard close makes them fight; anything else makes them come and look.

## Last known position

When an enemy sees you, it tells its **squad** where you are (`src/ai/squad.js`), and nearby squads hear it "on the radio". When you slip out of sight, they don't magically know where you went. They shoot at, then search, **where you were**. Flank them, and they'll be watching the wrong doorway. That's the single most important trick for AI that feels smart but fair.

## Playing fair on purpose

An AI that aims perfectly is easy to write and no fun to fight. Good game AI is a good *actor*: it gives you information and a chance. Ours does five things:

1. **Reaction time.** About half a second from first seeing you to first shot (Rifleman 0.45 s).
2. **Aim that settles.** Their aim error starts wide (4.5° for a Rifleman) and shrinks to about 1° only while they keep you in sight. They also track you with a small delay, so moving really does make you harder to hit. In tests, strafing at the gate kept you up twice as long as standing still.
3. **Warning shots.** Each enemy's first burst deliberately goes just over your head. You hear the crack and know where it came from.
4. **Attack tokens.** Like a ticket counter: only 2 enemies on Regular may shoot at you at once. The others move, flank or wait their turn. Without this, ten enemies seeing you at the same moment would drop you before you knew where they were.
5. **Telegraphs.** The Marksman's laser sits on you for 1.1 s before every shot, with a rising tone. See the red line, move.

Difficulty (Settings) is just these numbers: Recruit gets less damage, slower reactions, wider aim and one token; Veteran the opposite.

## Barks: AI that talks seems smarter

In the 2005 shooter *F.E.A.R.*, players praised the enemies for flanking them cleverly. The AI wasn't much cleverer than other games'. The difference was that the soldiers *said what they were doing*: "Flanking!", "I'm moving!", "Where'd he go?". Players noticed the plan because they heard it.

Ours do the same (`BARKS` in `src/ai/enemy-data.js`): "Contact!", "Reloading!", "Flanking!", "Lost visual!". Each callout plays a radio click and shows as a subtitle. Subtitles also make the game playable with the sound off.

## Time slicing: not everyone thinks every tick

Senses and decisions run every 0.1 s per enemy, not every 1/60 s, and enemies take turns (enemy 0 on tick 0, enemy 1 on tick 1...). Nobody notices a tenth of a second, and it divides the cost of all those rays by six. Route-finding is queued too: at most 2 searches a tick. In our tests the whole Compound fight (16 enemies, you and the physics) takes about 0.8 ms per tick, out of the 16.7 ms a tick lasts.

## Three roles from one brain

Rifleman, Rusher and Marksman run the *same* brain. Only the numbers in `ROLES` differ:
- how far they see and how fast they react
- how they aim
- their burst lengths and favourite range
- how keen they are to flank or charge

Change a number and the behaviour changes. That's data-driven design again, as with the guns in lesson 5.

## A real bug from building this

A patrolling enemy was supposed to stroll at about 2 m/s. In a test it crept along at **0.2 m/s**. Printing its commands showed it was pressing "forwards" at 42% (a slow walk), but its speed never went above 0.23.

The cause was in the movement code from lesson 3. Friction has a minimum strength ("stop speed") so that you stop crisply when you let go of the keys. That minimum takes off about 0.23 m/s every tick, and a slow walk only pushes about 0.23 m/s back on. They cancelled out exactly. You never noticed, because your keys always push at 100%. But a gamepad stick pushed halfway would have had the same bug.

The fix: the minimum only applies when you're *not* pushing a direction, which is the only time it was meant to help. The test *"a half-pushed stick walks at a slow, steady speed"* guards it now. **Lesson: new users of old code find old bugs.** The enemies were the first to walk slowly.

## Try this

Open the Compound, then the tuning panel (`` ` ``) → **AI**:

1. Tick **Show vision and brain state**. Walk up behind a guard, crouched, then standing. Watch the awareness percentage.
2. Fire one shot from outside the wall and watch who gets suspicious.
3. Set **Rifleman → Reaction time** to 0 and **Aim error at first** to 0. Try to survive. That's why real games don't do it.
4. Set Settings → **Difficulty** to Recruit, then Veteran.

## Common mistakes

- **Perfect aim.** Instantly lethal enemies feel like cheating, not challenge. Add reaction time, aim error and telegraphs.
- **Everyone shoots at once.** Use attack tokens.
- **Seeing through walls.** Every "can I see you?" check needs a line-of-sight ray.
- **Knowing where you are.** Use the last known position, not your real position, once you're out of sight.
- **Thinking every tick.** Time-slice senses and decisions. You'll have room for twice as many enemies.
