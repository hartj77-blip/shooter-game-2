# Lesson 1: The game loop

**The idea in one sentence:** the game repeats two jobs forever, *update the world* then *draw the world*, and we run the updates at a fixed 60 per second no matter how fast the screen draws.

## The everyday version

A flip-book again. Each page is one **frame**. To make the story move, you (1) work out where everything is now, then (2) draw it. Repeat.

The catch is that screens draw at different speeds: 60, 120, 144 or 240 times a second. If we moved the player "5 cm per frame", they'd run four times faster on a 240 Hz gaming monitor than on a 60 Hz laptop. Not fair, and it breaks physics.

## Fixed timestep, explained with a bucket

`src/core/loop.js` keeps a **bucket of time** (programmers call it the *accumulator*):

1. Every frame, pour in however much real time has passed, say 7 ms on a 144 Hz screen.
2. While the bucket holds at least one **tick** (1/60 of a second, about 16.7 ms), scoop one tick out and run one `update()`.
3. Whatever's left over (less than one tick) stays in the bucket for next frame.

On a fast screen, most frames run zero updates and a few run one. On a slow one, some frames run two. Either way the world moves forward in identical 16.7 ms steps, so movement, jumps and (later) bullets behave the same on every computer. That's also what makes online co-op possible: everyone's game takes the same-sized steps.

## Interpolation: smooth pictures between steps

If updates happen at 60 Hz but the screen draws at 144 Hz, some frames would show the same position twice, which looks juddery. So the leftover in the bucket becomes **`alpha`**, a number from 0 to 1 saying how far we are towards the next tick. The camera (`src/player/camera.js`) draws you at a point blended between your last two positions:

```js
feet.x = prev.x + (current.x - prev.x) * alpha;
```

Silky motion at any refresh rate, while the simulation itself stays fixed.

## Two safety valves

- **`MAX_FRAME_TIME`**: if a frame took ages (the tab was in the background), pretend it was only 0.25 s. Otherwise the game would try to replay minutes of missed time in one go.
- **`MAX_STEPS_PER_FRAME`**: on a computer too slow to keep up, cap the updates per frame. Otherwise each frame takes longer, which means more catching up, which means longer frames... the "spiral of death". With the cap the game slows down a bit instead of freezing.

## Where it lives

- `src/core/loop.js`: `advance()` is the bucket maths. It's a *pure function* (no side effects), which is why `tests/unit/loop.test.js` can test it on its own.
- `src/main.js`: `createLoop({ update, render })` is where the game plugs in what to do each tick and each frame.

## Try this

1. Press `` ` `` in game to open the tuning panel.
2. In **Time**, drag **Game speed** down to 0.1. That's slow motion, done by pouring time into the bucket ten times slower. Watch a slide or a mantle in slow motion.
3. Tick **Freeze world**. The world stops updating, but the loop keeps drawing, so you can still look around if you un-pause.
4. In the game's **Settings**, turn on **Show frame rate**. It shows how long updates and drawing take each frame. At 60 fps you have about 16.7 ms for everything.

## Common mistakes

- **Using the frame time for movement** (`position += speed * frameTime`). It seems fine until frame times vary, then jumps come out different heights on different computers.
- **Reading the keyboard inside `render()`.** Game logic belongs in `update()`; `render()` should only *show* things.
