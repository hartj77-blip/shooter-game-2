# Lesson 15: The director

**The idea in one sentence:** the director watches how hard the fight is for you and decides when to send more enemies and when to let you breathe, so a mission has a rhythm instead of a constant roar.

## Pacing: why a mission needs a rhythm

Picture whoever runs a haunted house. They don't send every ghost at you at once. They let you creep forward, build the tension, make you jump, then give you a quiet corridor to catch your breath before the next scare. Without that rhythm, the house is either boring (nothing happens) or exhausting (everything happens). With it, it feels like a story.

Games call this **pacing**, and the code that does it a **director**. *Left 4 Dead* (2008) made the idea famous with its "AI Director". Ours is in `src/game/director.js`. It only runs in missions; the Compound keeps its fixed garrison.

## Intensity: a stress meter for each player

The director can't see your face, so it keeps a number for each player from 0 to 1: their **intensity**, a stress meter. Things that would make your heart rate go up push it up:

| What happened to you | Intensity |
|---|---|
| Each point of damage you take | +0.012 (a 40-damage burst is about +0.5) |
| A bullet cracking past your head | +0.06 |
| Going down | +1 (straight to the top) |
| An enemy dropping within 12 m of you | +0.08 |
| Four calm seconds in a row | it starts draining, 0.07 a second |

The **squad's** intensity is the highest among the players still standing: if one of you is having a terrible time, the whole squad is.

## Phases: build-up, peak, relax

The director is a small state machine (lesson 4):

```
calm ──(time)──▶ build ──(intensity ≥ 0.72)──▶ peak ──(intensity < 0.3)──▶ relax ──(20–32 s)──▶ build
                  │ a wave every 30–48 s          no new waves                 no new waves
                  ▼
            crescendo: once the helicopter is called, a wave every 14 s, whatever the intensity
```

| Phase | What it does |
|---|---|
| **Calm** | The first 35–45 s of a mission (each mission chooses): just the garrison, so you can get your bearings |
| **Build-up** | Sends a wave every 30–48 s. 3, 4, 5 or 6 enemies for 1 to 4 players |
| **Peak** | You're under real pressure. It stops sending and lets the fight you're in play out |
| **Relax** | A breather of 20–32 s: reload, patch up, take ammo from a crate |
| **Crescendo** | The finale. Calling the helicopter starts it: waves keep coming until you're out |

Difficulty changes the pace: on Recruit the gaps are 30% longer and the waves one smaller; on Veteran the gaps are 20% shorter and the waves one bigger.

The director also has a **cap**, `maxAlive`: never more than 16, 18, 21 or 24 enemies standing (for 1 to 4 players), and the garrison counts. More than that is just noise. The fight stops being readable, and the computer has more brains to run.

## Fair spawns

Nothing feels worse than an enemy appearing out of thin air behind you. So reinforcements only ever arrive at the map's **entry points** (`entry` pieces in `levels/harbour.js`): the land gate, the east road, the jetty, the west quay, the village road. Each wave picks an entry that:

1. **Nobody standing can see.** For each player, two `SIGHT` rays go from their eyes to the entry, at waist and head height. If either gets through, that entry is out.
2. **Is at least 35 m from everyone** (`minDistance`).
3. **Is nearest the squad** among the ones left, so they don't spend five minutes walking.

Then they **run in along the entry's route**: a few points, like "through the gate, past the trucks, into the yard" (`route`). That's a brain state of its own, `advance` (`src/ai/brain.js`): run the route with eyes open, then be radioed where the squad was last seen, and go looking. A truck "pulls up" without our needing a truck. You see soldiers running in from the right direction, and your brain fills in the rest.

### Why it runs last in the tick

The director runs at the very end of `tick()` (`src/game/sim.js`). A new enemy's body only becomes something bullets and eyes can find after the next `world.step()` (`CLAUDE.md`'s "one tick, in order"). Spawning last means the step at the start of the next tick files them, before anyone looks.

## Key moments and the crescendo

Pure pacing is good at "how much" but bad at *drama*. So missions add **key moments** (set pieces) by name, in `levels/missions.js`:

```js
'intel:download': { wave: true, entry: 'east-road', say: 'Download started. A truck just came through the east road. Defend that laptop.' },
'extract:called': { crescendo: true, say: 'Helicopter inbound, sixty seconds.' },
```

When the objective reaches that moment, the director acts, whatever phase it's in: a wave from a named entry (if that entry is fair right now; otherwise the best fair one), a crescendo, a breather, and a line from **Overlord** on the radio (subtitled at the top of the screen).

## Deterministic, like everything else

The director never calls `Math.random()`. It uses the game's seeded random (lesson 8), so the same seed and the same commands give the same waves, at the same time, from the same places. `tests/unit/director.test.js` checks that, along with "never in sight", "never too close", "never above the cap", calm → build → peak → relax → build, and the key moments.

## A real bug: the crescendo that started with silence

Calling the helicopter should start the crescendo straight away: the first wave within a few seconds. Its test failed some of the time. It turned out the crescendo inherited the countdown left over from the phase before. If you happened to call the helicopter just after a wave, the "next wave in" clock still said 40 s, so the finale opened with 40 seconds of peace.

The fix is one line in `go()`: entering the crescendo sets the countdown to *at most* 4 s. **When you switch states, decide what each timer should be.** Timers carried over from the previous state are a classic source of "it works, except sometimes".

## Try this

1. Play a mission with the tuning panel open (`` ` ``) → **Missions → Director (live)**. Watch the phase, your squad's intensity and the countdown to the next wave. Get shot at and watch the intensity jump; hide and watch it drain.
2. Set **Director → Wave gap** shortest and longest to 8 s. Now it's a horde mode. Then set **Quiet at the start** to 0.
3. Set **Peak at intensity** to 2 (impossible): the director never backs off. Notice how much worse that feels.
4. In `levels/missions.js`, add `wave: 4` to Last Light's `'hold:start'` moment and play it.
5. In the console: `fireteam.mission.sim.director.view.log` lists its last decisions ("wave: 4 from jetty", "phase: relax").

## Common mistakes

- **Spawning where someone can see.** Players notice instantly, and it feels like cheating even when it isn't.
- **No cap.** Waves on a timer pile up if you hide; soon the map is full and the computer struggles.
- **Pacing on time alone.** A timer doesn't know you just survived a terrible fight. Intensity does.
- **Forgetting the breather.** Constant pressure is tiring, not exciting. The quiet is what makes the loud part work.
- **Random numbers from `Math.random()`.** Tests can't repeat a run, and co-op could disagree. Use the seeded random.
