# Lesson 14: Missions as data

**The idea in one sentence:** a mission is a short list of stages written down as data, each stage is a small state machine, and a checkpoint is a note of only the things you'd need to set the stage back up.

## A mission is a script, not a program

Think of a theatre script. It doesn't say *how* to act. It says who comes on, in what order, and what happens when. Our missions are the same: `levels/missions.js` is a list of plain objects, and the code that knows how to *run* a rescue, a download or a hold lives elsewhere (`src/game/objectives.js`).

```js
{
  id: 'harbour-rescue', title: 'Lifeline', kind: 'Rescue',
  stages: [
    { kind: 'rescue', sites: ['net-shed', 'chapel', 'smokehouse'] },
    { kind: 'extract', lz: 'lz', inbound: 60 },
  ],
  director: { calm: 40 },
  moments: {
    'rescue:freed': { wave: true, entry: 'village-road', say: "Good work. They know you're there..." },
    'extract:called': { crescendo: true, say: 'Helicopter inbound, sixty seconds.' },
  },
}
```

Writing a new mission means writing a new list like this, not new code. The same map (the Harbour) carries four missions, and `missionLevels()` turns each one into its own entry in the map list. To the title screen, the lobby and the address bar, "harbour-rescue" is just another map.

| Mission | Stages |
|---|---|
| **Lifeline** (rescue) | find and free the hostage → extract with them |
| **Dead Drop** (intel) | find the laptop → download (60 s, defend it) → take the drive → extract with it |
| **Short Fuse** (sabotage) | plant a charge on three caches (10 s fuse each) → extract |
| **Last Light** (hold the line) | reach the lighthouse radio → hold the headland for 3 minutes → the helicopter is already coming |

## "One of these three buildings"

Each stage lists its possible **sites** (the level's `site` pieces). Which one is real is picked from the game's **seed** (lesson 8's seeded random), so every game is a little different, and the host and every co-op client agree on the pick without arguing.

You're told roughly where to look. A "?" marker floats over each possible site until you get within 11 m (`REVEAL` in `src/ui/objective-hud.js`); then it changes to what's really there, or disappears. Props follow the same rule: every possible intel room gets a table, but only the real one has a laptop on it (`src/render/props-view.js`).

## Objectives are small state machines

Lesson 4's state machines are back. Each objective is a little machine with a **phase**, and a few things that move it on:

| Objective | Phases |
|---|---|
| Rescue | `find` → (free them) → done |
| Intel | `find` → (start it) → `download` → (finished) → `collect` → (take the drive) → done |
| Sabotage | `plant` (each cache: plant → 10 s fuse → bang) → done |
| Hold | `reach` → (switch on the radio) → `hold` → (3 minutes) → done |
| Extract | `call` → (radio) → `inbound` → `landing` → `landed` → (everyone aboard) → `leaving` → mission complete |

Every objective has the same few parts: `update(dt)` (tick the download, the hold timer, the fuses), `spots()` (what you can hold F at right now), `save()` and `restore()` (for checkpoints), plus `phase`, `progress` and `timer` for the HUD. The operation (`src/game/operation.js`) doesn't care which kind it's running: it starts stage 0, calls `update` every tick, and moves on when the objective says it's complete.

## Hold to interact

Freeing a hostage, starting a download, planting a charge, calling the helicopter, taking ammo from a crate: all of them are "hold F for a moment". Rather than five copies of that logic, there's one (`src/game/interact.js`), modelled on lesson 11's revive:

- Each tick it finds the nearest thing you could use (within 1.6 m along the ground, and 1.5 m up or down).
- Holding F fills a bar; let go and it empties. Like a lift button you have to keep pressed.
- When the bar is full, the thing's `done()` runs, once. You must let go of F before the next one starts (a **latch**), so a single long press can't free a hostage *and* grab ammo.
- Reviving a teammate always wins over everything else.

Objectives only *offer* spots; they never read the keyboard. That keeps the simulation in charge, and on a co-op client the hold works just like the host's (it's in your command, and the host decides).

## Contested: progress that pauses

The download only runs while no enemy is within 7 m of the laptop, unless one of you is within 12 m guarding it. Holding the line only counts while one of you is inside the area and no enemy is. That's **contested** progress: like a tug of war, it only moves while you hold your end. The HUD turns the bar red and says "Download stalled: clear the enemies from the laptop!".

## Checkpoints: save only what matters

When you finish each step, the game saves a **checkpoint**. Fail later (everyone down, or the hostage bleeds out) and the host presses R to **retry** from it.

A checkpoint is *not* a copy of the whole game. Copying everything (every bullet hole, every enemy's thoughts) would be big, slow and fragile. It's like saving a board game by writing down the score and whose turn it is. You don't photograph every piece. Ours writes down:

| Saved | Why |
|---|---|
| The stage and the objective's own `save()` | Where in the mission you are |
| What you carry (the drive, and who has it) | The job depends on it |
| The hostage's position and state | Freed or not, where they stood |
| Which of the level's own guards were already dealt with | They stay gone. Everyone else comes back calm |
| Refills left in each crate | No free ammo by retrying |
| The mission clock, and safe spots to start from | Picked so nobody restarts in mid-air or in a fight |
| Your ammo (each browser saves its own) | You restart with what you had |

Reinforcements aren't saved at all: a retry sends them away, and the director starts calm again. Teammates who bled out come back beside a standing teammate when the *next* checkpoint is reached. Restarting from the very beginning ("Play again") is a different button: `restart()`, not `retry()`.

## One summary for every screen

The HUD never looks inside the objectives. It reads `operation.view`: a small summary (stage, kind, phase, progress, timer, the real sites, what's done and armed, who carries the drive, the helicopter's phase and time). The host sends that same summary in every snapshot (`op`, encoded in `src/net/protocol.js`), so a co-op client's panel, markers and props are drawn from exactly what the host's are.

## The debrief

When the helicopter lifts off, `mission:complete` carries the results: time, best time (per mission, and per squad size in co-op), kills, headshots, accuracy, damage taken, retries, and each player's own row. Two and a half seconds later the debrief screen shows them (`src/ui/debrief.js`), with **Play again**, **Back to lobby** (or **Leave game** for a friend) and **Main menu**.

## A real bug: the frozen photo

Every mission part offers a `view` that the HUD reads each frame. It's a **getter**: a property that runs a little function each time you read it, so it's always up to date. We built those objects like this:

```js
return Object.assign(op, { update, restore, get view() { return { /* ... */ }; } });
```

The HUD's objective text never changed. The mission was running fine underneath, but the panel was stuck on its very first frame.

The catch: `Object.assign` copies *values*. It reads `view` once, runs the getter, and stores the answer. It doesn't copy the getter itself. So `op.view` became a frozen photo of the first moment. The fix copies the getter itself, the "how to work it out", not its answer:

```js
return Object.defineProperties(op, Object.getOwnPropertyDescriptors({ update, restore, get view() { /* ... */ } }));
```

The operation, the hostage and the director all had the same mistake, and all three now carry a comment pointing here.

## A real bug: the restart ghost

In co-op, the host sends events ("enemy 3 is down") on a timeline, and a client plays them 0.1 s late, in step with what it draws (lesson 11). If the host restarts while an "enemy 3 is down" is still on its way, the client plays it *after* the restart, and knocks over the brand-new enemy 3. It was rare with one restart button, but retries would have made it common.

The fix: `mission:restart` carries the tick it happened on. When a client plays it, it throws away any older events and snapshots still waiting, and rebuilds its enemy stand-ins from scratch. The test (`restart ghost` in `tests/unit/net.test.js`) sets the trap on purpose: a kill and a restart in quick succession over a laggy pretend network.

## Try this

1. Play **Dead Drop** solo. Start the download, then let an enemy walk up to the laptop while you hide far away: watch the bar stop and turn red.
2. Get a checkpoint, then get yourself downed. Press R. Check the guards you'd dealt with are still gone, and your ammo is what it was at the checkpoint.
3. In `levels/missions.js`, change Lifeline's `'rescue:freed'` line to say something else, reload, and free the hostage.
4. Open the tuning panel (`` ` ``) → Missions → Objectives and set the download to 10 seconds.
5. In the browser console, type `fireteam.session.operation.view` a few times while playing, and watch it change.

## Common mistakes

- **Saving everything.** A checkpoint that copies the world is big and breaks whenever the world changes shape. Save the few facts you need to rebuild it.
- **Objectives that read the keyboard.** They offer spots; `interact.js` decides who's holding F. Otherwise co-op clients would disagree with the host.
- **Copying a getter with `Object.assign` or `{...spread}`.** You get its value once, not the getter.
- **Forgetting that events can arrive late.** Anything that resets the game must also throw away news from before the reset.
- **Telling players exactly where to go.** "One of these three" makes them look around; a big arrow makes them stop looking at the world.
