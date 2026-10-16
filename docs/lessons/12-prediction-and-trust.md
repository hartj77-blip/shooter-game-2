# Lesson 12: Prediction and trust

**The idea in one sentence:** your own soldier moves the instant you press a key, because your browser *predicts* what the host will say, quietly corrects itself when it guessed wrong, and decides for itself what your bullets hit.

## The problem: lag you can feel

If the host is 60 ms away, a command takes 60 ms to get there and the answer 60 ms to come back. Waiting for the host before moving your own soldier would make every step feel like wading through treacle, 120 ms late. Fine for chess, awful for a shooter.

## Client-side prediction: writing in pencil

Your browser runs **the same movement code** the host runs (`src/player/controller.js`, unchanged since milestone 1). When you press W it moves your soldier straight away and *guesses* the host will do the same. Because the code is identical and the movement state is plain data (lesson 3: "easy to save, compare and send"), the guess is almost always exactly right.

Every command gets a number. Your browser remembers what it predicted after each one:

```
command #810 → predicted: x 4.20, z −3.10
command #811 → predicted: x 4.27, z −3.10
command #812 → predicted: x 4.34, z −3.10   ← you are here, ahead of the host
```

It's writing in pencil. The host's snapshot is the teacher handing back the marked page: "after #810 you were at x 4.20".

## Reconciliation: rewind and replay

When a snapshot arrives (`reconcile()` in `src/net/client.js`):

1. Find what we predicted for the command the host says it used (`ack`, short for "acknowledged").
2. **They match** (within 1 cm): nothing to do. This is the usual case.
3. **They don't**: put your soldier exactly where the host says (`restore()`, new in `controller.js`), then **replay** every command since, in a flash. You end up where you'd be if you'd guessed right all along.
4. The jump is usually a few centimetres. Rather than snap, the camera **glides** over the gap in a tenth of a second (`correction` in `client.js`, `offset` in `src/player/camera.js`).

Sounds and camera bumps are switched off during a replay. You already heard that landing the first time.

### How often does it happen?

A test plays on a perfect network with nobody touching anyone: **zero corrections**, while running, jumping, sliding and crouching. On a bad network (60 ms each way, jitter, 8% loss) there are a handful in 8 seconds, the biggest about 12 cm. You'd never notice them with the camera glide.

Corrections come from two places:
- **The host had to guess your command** because it arrived too late (see the jitter buffer below).
- **Bumping into someone.** Everyone else is drawn 0.1 s in the past (lesson 11), so your browser's idea of where they stand differs from the host's. Brush past a teammate and the two disagree, slightly.

### A real bug: the sharp cylinder

Our first version gave the stand-ins a *sharp-edged* cylinder body. The real soldiers' bodies are *round-edged* (lesson 3: they slide off corners). Brushing past the host's soldier, a client slid along the sharp edge about a centimetre differently from the host: a correction every time. The fix was to build both from the same function (`bodyCollider()` in `controller.js`). **When two computers must agree, give them the same shapes and the same code.**

### Why your own screen is "ahead"

One of our first tests checked that a running client was within 20 cm of the host. It failed: the gap was about 45 cm. That's not a bug, it's prediction working. Your browser is ahead of the host by the travel time (60 ms there) plus the jitter cushion (below). At sprint speed that's about 45 cm. When you stop, the host catches up and the gap closes to nothing.

## The jitter buffer: a small waiting room

Packets bunch up like buses. If the host used each command the instant it arrived, some ticks would have none and others two. So the host keeps a **cushion of about two commands** waiting per player, and takes one each tick (`src/net/jitter.js`):

| Situation | What the host does |
|---|---|
| Normal | Takes the next command (a 33 ms delay nobody notices) |
| Nothing waiting | **Guesses**: repeats the last command, without its one-off presses (no double jumps). The client corrects itself if the guess was wrong |
| Lots waiting (after a hiccup) | Takes **two** per tick until it's caught up |

Snapshots also say how full your cushion is, and your browser runs a touch faster or slower (2%) to keep it about two deep. Clocks on different computers never tick at exactly the same speed.

## Favour the shooter

Here's a puzzle. You see an enemy (drawn 0.1 s in the past) and shoot them. On the host, "now", they've already stepped behind a wall. Who's right?

Big competitive shooters wind the host's world back in time to check each shot ("lag compensation"). We do something simpler that suits co-op: **your browser decides what your bullets hit**, tracing them against the stand-ins exactly where you see them. Then it tells the host: "I shot Rifleman #3 in the chest for 30 damage" (a **hit claim**). The host does loose checks before applying it (`applyFire()` in `src/net/host.js`):

- Are you alive and standing?
- Did the shot start near where the host has you?
- Is the damage possible for that gun? A test claims 100,000 damage with a carbine; the host caps it.
- Is the target an enemy? Never a teammate: friendly fire is off.

The result: **you hit what you aimed at**. The cost: someone could cheat by sending fake claims. Among friends that's fine; for strangers with prizes at stake it wouldn't be. This is a classic trade-off, and different games choose differently.

Your hit marker and the kill sound happen instantly, decided by your browser. The enemy's ragdoll arrives a moment later, when the host confirms it.

## Same rules everywhere

Prediction only works if your browser and the host apply the *same* rules from the *same* information:

- **Downed players can't move.** Both sides turn a downed player's command into "stand still" (`sim.js` on the host, `step()` in `client.js`).
- **Busy hands.** Holding F stops your gun, decided from the command alone (`busyHands` in `soldier.js`). Your browser doesn't need to know whether a teammate is really there to revive.
- **Rounded commands.** Commands are rounded before sending, so the client predicts with the *rounded* numbers (`roundCommand()` in `protocol.js`). Otherwise the client turns 0.12345 rad while the host turns 0.1235 rad, and they drift apart.

## Try this

1. `npm test` runs the network tests (`tests/unit/net.test.js`) over a pretend network. Open `tests/support/coop.js` and try `net: { delay: 150, jitter: 60, loss: 0.2 }` in a test. Which tests still pass?
2. In `src/net/protocol.js`, make `SNAPSHOT_EVERY` 6 (10 a second) and play two tabs (`?net=local`). Watch your teammate: smoother or jerkier? Now set `INTERP_DELAY` to 12.
3. In `src/net/client.js`, change `MATCH` to 0.0001 and see how often corrections happen. Every correction is a tiny camera glide.

## Common mistakes

- **Predicting with different numbers.** If your browser uses the exact command but the host gets a rounded one, every snapshot is a correction. Round first, then predict.
- **Different shapes.** A stand-in that isn't the same shape as the real thing makes the two computers disagree (the sharp cylinder).
- **Replaying with effects.** Replays must be silent, or you hear every landing twice.
- **Snapping corrections.** Even a 5 cm teleport of the camera is felt. Ease it out.
- **Trusting claims blindly.** Even among friends, check them: a bug that sends bad numbers looks just like a cheat.
