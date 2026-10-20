# Lesson 26: Polish: settings, touch and keeping it smooth

**The idea in one sentence:** polish is making the game fit the player (their keys, their screen, their ears, their computer), and the trick that makes it cheap is that every input already becomes the same commands.

## Your keys, not ours

Every key press becomes an **action** ("interact", "jump") through one table, `DEFAULT_BINDINGS` (`src/core/input.js`), and actions become commands (lesson 4). So rebinding only changes the table; nothing else in the game notices. It's like relabelling the buttons on a lift: the lift still goes to the same floors.

- **Settings → Controls:** click an action, then press a key or mouse button (`captureNext`).
- Your keys are saved with the settings (`keys`), and checked like every saved value (`cleanKeys`): only real actions, only plausible key codes, and never Escape or `` ` ``, which pause and open the tuning panel.
- A key belongs to one action only (`bindingsWith`). Give F to Reload, and Use loses it.
- On-screen prompts ask the bindings, not a fixed list (`keyName`): rebind Use to E and every "Hold F" becomes "Hold E".

## Fitting the screen and the ears

- **HUD size** (75–150%) scales the panels with one CSS variable (`--hud-scale`), while the crosshair and the markers in the world stay put. **Show the HUD** off gives a clean screen for screenshots.
- **Subtitles:** radio lines and enemy callouts as text, now with an off switch.
- **Interface volume:** hit markers, beeps and chimes go through their own channel (the `ui` bus, lesson 7), so they have their own knob.

## Touch: a different hand on the same buttons

`src/ui/touch.js` draws controls on a touch screen (or with `?touch` in the address):

- **The left half is a stick.** It appears wherever your thumb lands, so you never have to find it. How far you drag (up to 60 px) is how hard you push.
- **The right half turns the view** as you drag.
- **Buttons** for fire, aim, jump, crouch, reload, use, grenade, call-in, next gun and pause.

They all call `input.touch`, which presses the same actions a key would. So movement, shooting and even co-op prediction just work: the simulation can't tell a thumb from a keyboard.

**Multi-touch** is the one new idea: each finger has an `identifier`, so the game remembers which finger is the stick and which is looking, and two thumbs never get mixed up.

## Automatic graphics quality

`src/core/perf.js` is a **governor**, like a car's automatic gearbox. It watches the frame rate while you play, and if it stays under 40 frames a second for 5 seconds, it steps the graphics quality down one level and tells you.

- It **waits** first, so one slow moment (a map loading, a big explosion) doesn't change anything.
- It **only steps down.** Stepping back up when things got faster would make it *hunt*: flick between two levels forever, which looks worse than either.
- Turn it off in Settings (Automatic graphics quality). The browser tests do, so they measure exactly the quality they ask for.

## Try this

1. Settings → Controls: put Use on E. Walk up to an ammo crate in a mission: the prompt says "Hold E".
2. Open the game with `?touch` and play with your mouse as a finger (Chrome's device toolbar, Ctrl+Shift+M, gives you real touches).
3. Set HUD size to 150%, then turn Show the HUD off and take a screenshot.
4. Tuning panel → Graphics: set quality to high on a slow laptop and wait.

## Common mistakes

- **Rebinding by special-casing keys** in the game code. Change the table; keep actions the only thing the game sees.
- **Letting a key belong to two actions**, or letting someone take the pause key.
- **A touch stick fixed in one place.** Thumbs land wherever; put it there.
- **An automatic setting that changes both ways.** It hunts. Change one way, and let people change it back.
