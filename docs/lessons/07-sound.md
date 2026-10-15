# Lesson 7: Sound

**The idea in one sentence:** the browser gives us a little mixing desk (the Web Audio API) where each sound flows through volume knobs, a 3D positioner and some echo before reaching your speakers.

## The mixing desk

`src/audio/audio.js` builds this chain once:

```
sound ─▶ volume ─▶ [3D panner] ─▶ effects bus ─┐
                                interface bus ─┼─▶ master ─▶ compressor ─▶ speakers
   (gunshots also feed) ─▶ echo (reverb) ─────┘
```

- A **bus** is a channel with one volume knob for a whole group of sounds. "Effects volume" in Settings turns the effects bus.
- The **panner** places a sound at a point in the world. It gets quieter with distance and comes from your left or right ear depending on where it is. Bullet impacts and steel plates use it. Your own gun doesn't; it's right in your hands.
- The **compressor** is an automatic volume limiter: when lots of loud shots stack up, it turns them down a little so they don't distort.
- The **reverb** gives gunshots a short echo. It works by mixing in the "sound of a space" (an **impulse response**), which we make in code: noise that fades away. No file needed.

## Why every shot sounds slightly different

Hearing exactly the same recording 15 times a second makes a machine gun sound robotic (gamers call it the "machine-gun effect"). So `src/audio/sound-bank.js` gives most sounds 2 or 3 recordings to pick from, and every play gets a slightly different **pitch** (±5%) and volume. Your ears read that as one real gun.

## Why there's no sound until you click

Browsers block sound until you click or press a key on the page, so websites can't blast audio at you. The game downloads all the sound files while loading, but only switches the engine on (`audio.unlock()`) when you click **Deploy**.

## Where the sounds come from

They're real recordings, all **CC0**: public domain, free for anything, no permission needed.

- Gunshots from *The Free Firearm Sound Library*: a K4 that's really an AR-15, a Swedish K submachine gun, a Benelli pump shotgun and a Walther pistol, recorded close up.
- Reloads, pumps and clicks from several OpenGameArt packs; impacts and footsteps from Kenney's Impact Sounds.

Raw recordings are long: a gunshot followed by seconds of echo. `tools/build-sounds.py` cuts each one at the right moment, mixes it to mono (so it can be positioned in 3D), fades the tail, evens out the loudness and saves a small MP3. All 54 files together are about half a megabyte. Every source and author is listed in `CREDITS.md`, and every sound has a code-made stand-in in case a file fails to load.

One fiddly detail: MP3 files start with about 25 milliseconds of silence. That sounds tiny, but a gunshot that starts late feels laggy. So the engine finds where each sound really starts and skips the silence.

## Footsteps

Each time the camera's head bob dips, `src/audio/game-sounds.js` plays a footstep. A short ray down from your feet asks what you're standing on: wood sounds different from concrete. Sprinting is louder, crouching quieter. Later, enemies will be able to *hear* those footsteps.

## Try this

1. In Settings, set **Effects volume** to 0 and fire a burst, then turn it back up. Notice how much weaker the gun *feels* with no sound, even though nothing about the game changed.
2. At the range, shoot the steel plates from the far left lane, then from the far right lane, with your eyes on the floor. Can you hear the ding move between your ears?
3. Open the developer console (F12) and run `fireteam.audio.play('ding', { position: { x: 0, y: 1, z: -20 } })`.

## Common mistakes

- **Creating sounds before a click.** It fails silently, or prints a warning. Unlock on the first click.
- **Playing 8 identical sounds in the same instant** (a shotgun's 8 pellets hitting a wall) just makes one very loud sound. The engine allows at most 3 copies of the same sound in the same instant.
- **Forgetting that sound is half of game feel.** Players describe a gun as "punchy" mostly because of how it sounds.
