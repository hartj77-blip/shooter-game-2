# Lesson 4: Commands, events and state machines

**The idea in one sentence:** three simple patterns keep the code from turning into spaghetti: input becomes *commands*, systems talk through *events*, and anything with modes is a *state machine*.

These look like extra work for a one-player movement sandbox. They're here now because adding them later, once enemies, weapons and co-op exist, would mean rewriting half the game.

## 1. Commands: "what the player wants", as data

`src/core/input.js` never moves the player. Once per tick it produces a **command**, a small plain object:

```js
{ moveX: 0, moveZ: 1, yaw: 1.57, pitch: -0.1, jump: true, crouch: false, sprint: true }
```

The movement code (`player.update(command, dt)`) only ever reads commands. Why bother?

- **Co-op:** a friend's commands can arrive over the network and drive their character with exactly the same code.
- **Testing:** the unit tests drive the player with scripted commands, no keyboard needed.
- **Replays and bots:** a list of commands *is* a replay. An AI squadmate is just something that writes commands.

There's even a test for **determinism**: the same commands must always give *exactly* the same result. Networked games depend on it.

## 2. Events: a noticeboard

When you land, the player code posts one notice: `events.emit('player:land', { speed })`. The camera listens and dips the view. Later the sound system will listen and play a thud, and the HUD might flash. The player code never needs to know who's listening. See `src/core/events.js` for the whole thing; it's about 30 lines.

Without this, the player code would end up calling the camera, the sound, the HUD and the stats tracker directly, and every new feature would mean editing it again.

## 3. State machines: one mode at a time

A traffic light is a **state machine**: it's always in exactly one state (green, amber, red), with clear rules for moving between them.

Our game flow is one (`src/main.js`):

```
loading → title --Deploy--> playing <--Esc / Resume--> paused --Quit--> title
```

Each state says what happens when you **enter** it. Entering `paused` turns input off and shows the pause menu; entering `playing` hides menus and shows the HUD. That makes bugs like "the pause menu is open but you can still walk around" hard to write.

Your movement is a smaller one: `ground`, `air`, `slide` or `mantle`. You can watch it change in the bottom-left readout (SPRINT, SLIDE, AIR, CLIMB) and in the tuning panel's **Live** section.

In milestone 3 every enemy's brain will be a state machine too: patrol → suspicious → attack → take cover → flank.

## Separation: simulation versus presentation

One more rule underneath all of this: **simulation** code (where things are, what they hit) never draws, and **presentation** code (camera wobble, HUD, sound) never changes the simulation. The head bob in `src/player/camera.js` makes your view bounce, but your actual position never bounces. That's why "Reduce camera motion" can safely switch it all off, and why the simulation can run in tests with no screen at all.

## Try this

1. Open the developer console (F12) and run
   `fireteam.events.on('player:land', (e) => console.log('landed at', e.speed.toFixed(1), 'm/s'))`.
   Now jump off the tower. You just added a feature without touching the game's code.
2. Run `fireteam.flow.state` to see which game state you're in.

## Common mistakes

- **Booleans instead of states.** `isPaused`, `isInMenu`, `isPlaying`, `isLoading`... four booleans allow 16 combinations, most of them nonsense ("paused AND loading"). One state variable allows exactly the valid ones.
- **Forgetting to stop listening.** `events.on()` returns a function that removes the listener. Call it when the listener's owner goes away, or old listeners pile up.
