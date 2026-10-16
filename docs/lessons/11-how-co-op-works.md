# Lesson 11: How co-op works

**The idea in one sentence:** one player's browser runs the real game (the **host**). Everyone else sends it their button presses and gets back a description of the world, twenty times a second.

## The host is the referee

Picture four friends playing football with one referee. Everyone plays, but only the referee decides whether it was a goal. Our co-op works the same way:

| Who | Runs | Decides |
|---|---|---|
| **The host** (whoever pressed *Host co-op*) | The whole simulation: every soldier, the enemies, their bullets, health, the timer | Everything that matters |
| **The clients** (everyone who joined) | Their own soldier, plus stand-ins for everyone else | Only what their own gun hits (lesson 12) |

This is called an **authoritative host**. Its big advantage is that there's only one truth: the enemies are in one place, the clock says one time. The enemies' brains (lesson 8) only run on the host. Clients never need to agree with each other about what a Rusher is thinking.

Solo play is simply *hosting a game for one*: it runs through the same code (`src/net/host.js`), so every solo game tests the co-op code too.

## Commands up, snapshots down

Since milestone 1 your keyboard has turned into **commands**, small objects that say "this tick: walking forward, aiming, firing" (lesson 4). The enemies are driven by commands too. That design is what makes co-op possible:

```
your browser                                     the host
 keyboard → command #812 ──── 60 a second ───▶ jitter buffer → simulation
                                                                │
 drawing  ◀── snapshot (where everyone is) ◀── 20 a second ──────┘
          ◀── events (a shot, a hit, "Bravo is down") ◀── as they happen
```

- **Commands** go up 60 times a second. Each packet also repeats the previous few commands, so one lost packet doesn't lose a jump.
- **Snapshots** come down 20 times a second: every player and enemy's position, facing, stance and health, and the timer.
- **Events** are things that happen once: a shot (so you see the tracer and hear the bang), an enemy going down (ragdoll time), a teammate needing help.

All the message formats are written down in one file, `src/net/protocol.js`, like the rules of chess-by-post.

## The four enemies of online play

Messages cross the internet in **packets**, and packets misbehave in four ways:

| Problem | What it means | Everyday version |
|---|---|---|
| **Latency** (ping) | Time for a message to get there. "Ping" in a lobby usually means there *and back* | Talking to someone on the other side of a canyon: you wait for the echo |
| **Jitter** | The delay changes from packet to packet | Buses scheduled every 10 minutes that arrive in clumps |
| **Packet loss** | Some packets never arrive | Letters lost in the post |
| **Bandwidth** | How much you can send per second | How wide the pipe is |

Everything in `src/net/` exists to cope with one of these.

## Reliable or unreliable: a recorded letter or a shout

There are two ways to send a message:

- **Reliable**: it arrives, in order, guaranteed. If it gets lost, it's sent again, and everything behind it waits. That's a recorded letter. We use it for events and the lobby: you must not miss "you won", and "you're down" can't overtake "you're hurt".
- **Unreliable**: sent once. If it's lost, it's gone, and a later one can overtake an earlier one. That's shouting across a room. We use it for snapshots and commands, because a newer one is coming in a fiftieth of a second anyway, and waiting for an old one to be resent would only make things *later*.

> **A discovery while building this:** PeerJS (the library that connects browsers) has a `reliable: false` option. Reading its source, it only turns off the *ordering*: lost messages are still resent. So `src/net/transport.js` opens its own second channel, set to **never resend** (`maxRetransmits: 0`), for snapshots and commands. Read the source of the libraries you depend on!

## Interpolation: watching a slightly delayed broadcast

Snapshots arrive 20 times a second, unevenly, and sometimes not at all. If we drew everyone exactly where the last snapshot said, they'd jump about in steps.

So clients draw everyone else **0.1 seconds in the past**, sliding smoothly between the two snapshots either side of that moment. It's like live TV on a short delay: everything's smooth, at the cost of a moment's lag. Because we're 0.1 s behind, there's almost always a "next" snapshot to slide towards, even when one goes missing (`interpolate()` in `src/net/client.js`, the stand-ins in `src/net/proxies.js`).

Events wait on the same delay (the "timeline" in `client.js`), so a tracer starts at the muzzle you can see, not where that soldier is "now".

A test walks a teammate in a straight line over a bad network (60 ms delay, jitter, 8% loss) and checks they *never* take a step backwards on the other screen.

## Quantization: shrinking numbers

A position like `12.345678901234` takes 15 characters to send. Nobody can see a millimetre, so snapshots send it to the nearest centimetre, as the whole number `1235`. Angles go to the nearest thousandth of a radian. That's **quantization**: rounding on purpose to save bandwidth.

A 4-player Compound snapshot (4 players, 16 enemies, the timer) is about 1.4 KB, well under the 2.5 KB budget a test enforces. At 20 a second, that's about 28 KB/s per player: fine for any home connection.

## Rooms, codes and the lobby

The host opens a **room** with a five-letter code like `KQXRT`. There's no I, L or O, because they look like 1 and 0 when read aloud. Friends type the code, or open the invite link (`…?join=KQXRT`). The lobby shows everyone's **callsign** (name in game), slot colour and ping (`src/net/room.js`, `src/ui/lobby.js`).

When the host presses Start:
1. The host builds the map.
2. The room tells everyone to start.
3. Each browser builds the map and says **"loaded"**.
4. Only then does the host add that player's soldier.

Joining a game already running works the same way.

## Co-op rules

| Rule | How it works | Where |
|---|---|---|
| **Friendly fire: off** | Your bullets fly straight through teammates | `passThrough` in `src/player/soldier.js` |
| **Going down** | At 0 health you go down and **bleed out** over 30 s, a match burning down | `src/player/health.js` |
| **Reviving** | A teammate holds **F** next to you for 3 s: you're back on 30 health. Let go and it starts over | `src/game/revive.js` |
| **Busy hands** | While holding F you can't shoot | `busyHands` in `soldier.js` |
| **Out** | Bleed out and you **spectate** (watch over a teammate's shoulder; click to switch) until the next fight | `spectate()` in `src/mission.js` |
| **Mission failed** | Everyone down at once. The host presses R to restart | `src/game/encounter.js` |
| **Fair fights** | Each enemy picks one target. Each player has their own attack tokens. Enemy health grows a little with squad size | `src/ai/`, `PLAYER_SCALING` |
| **Pings** | **Z** (or middle mouse) marks the enemy or spot you're aiming at, for everyone | `src/game/pings.js` |

"Busy hands" is decided from the command alone ("is F held?"). That matters for lesson 12: your browser and the host can both apply the rule without asking each other anything.

## The mission loader: changing map without reloading

Before co-op, choosing a map reloaded the page. A reload would drop every connection, so the game is now split in two:

| Part | Lives | Holds |
|---|---|---|
| **The app shell** (`src/main.js`) | As long as the page | The renderer, sound, input, settings, menus, the room |
| **A mission** (`src/mission.js`) | One map | Its own event noticeboard, the session (host or client), everything it draws (under one `root` group), the HUD, the tuning panel |

`dispose()` strikes the set between plays. It removes the group from the scene, gives the graphics card its memory back (`src/render/dispose.js`), frees the physics engine's memory, empties the HUD and closes the panel. A browser test switches maps and back, then checks nothing was left behind: the same number of objects, the same graphics memory, no leftover HUD bits.

### A real bug: the title screen that never came back

That test found a bug on its first run. After switching map, the title screen stayed hidden. The loading screen had hidden it, and afterwards we "went to" the title state, but the state machine ignores "go to where you already are". The fix: after loading, show whatever screen belongs to the current state.

### A real bug: climbing onto people's heads

The prediction test from lesson 12 checks that a client's guess matches the host *exactly* on a perfect network. It kept failing in one spot near the spawn: the client climbed (**mantled**) onto something the host said wasn't there. That something was another player. The ledge finder asked the physics engine "is anything solid here?", and people count as solid. So you could climb onto a crouching teammate's head, or an enemy's. On top of that, the stand-in body on a client is shaped slightly differently from the real one, so the two computers disagreed about it.

The fix was one word: ledges now come from the **level only** (the `LEVEL` collision group from lesson 10). "Is there room up there?" still counts people. A regression test runs at a crouching soldier and jumps, and checks no climb starts.

### A real bug: the invisible wall

While writing those tests, we noticed that when an enemy died, only its hitboxes were switched off. Its movement cylinder (lesson 10) stayed behind as an invisible wall, so you slid round a ragdoll that wasn't there. Now both switch off, and a test walks straight through the spot.

## Try this

1. Open the game in two tabs of the same browser, adding `?net=local` to the address in both. Host in one, join with the code in the other. That's co-op without the internet, over the browser's `BroadcastChannel`.
2. In the host tab, open the tuning panel and slow the game down. Watch how the client's view of you stays smooth.
3. Get downed (God mode off, stand in the gate) and have the other tab revive you. Let go of F halfway and watch the ring reset.
4. Ping an enemy (Z) and watch the marker follow them on the other screen.

## Common mistakes

- **Trusting the order of unreliable messages.** A newer snapshot can arrive before an older one. Check the tick number and ignore old news (`onSnapshot` does).
- **Sending objects that only make sense on one computer.** An enemy *object* can't cross the internet, only its name (`wireEvent` turns them into ids).
- **Repeating presses.** When a command goes missing, repeating the last one is a fine guess, but not its *jump*. `heldOnly` in `src/core/input.js` strips one-off presses. We found this when a ping got sent twice.
- **Leaking between missions.** Anything a mission adds (listeners, DOM elements, physics worlds) must be removed in `dispose()`. A per-mission event noticeboard means its listeners go with it.
