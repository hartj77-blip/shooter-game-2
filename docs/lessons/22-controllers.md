# Lesson 22: Controllers

**The idea in one sentence:** a controller is read by asking it every frame what's pressed, and its sticks need shaping (a dead zone, a curve, a boost) before they feel as good as a mouse; then it makes exactly the same commands the keyboard does.

## Polling: checking the letterbox

A keyboard tells the browser "this key went down" the moment it happens: an **event**, like a doorbell. The browser's Gamepad API doesn't. You ask for a snapshot (`navigator.getGamepads()`), and it says where every stick is (two numbers from -1 to 1 each) and which buttons are held (triggers as 0 to 1). So once a frame we ask, and compare with last frame to see what was just pressed or released. That's **polling**, like checking the letterbox instead of waiting for the doorbell.

It all lives in `src/core/gamepad.js`. The browser's `getGamepads` is handed in from outside, so the tests can feed it pretend controllers (`tests/unit/gamepad.test.js`).

Then `src/core/input.js` turns the controller's actions into the same command objects the keyboard and mouse make (lesson 4). The simulation can't tell which you used, so everything (prediction in co-op included) just works.

## The standard layout

Modern controllers report a **standard mapping**: button 0 is always the bottom face button, 7 always the right trigger. So one table (`PAD_BUTTONS`) covers Xbox, PlayStation and most others:

| Button | Does |
|---|---|
| Left stick / right stick | Move / look |
| RT / LT | Fire / aim |
| A / B | Jump / crouch |
| X | Tap: reload. Hold: use (revive, free, plant, take ammo) |
| Y | Your last gun |
| RB / LB | Grenade / ping |
| L3 (press the left stick) | Sprint |
| D-pad left / right | Previous / next gun |
| D-pad up / down | Squad radio (hold) / night vision |
| Start | Pause |

X does two jobs, because a controller has fewer buttons than a keyboard. Under 0.25 s (`holdUse`) it's a tap and reloads; held longer it becomes "use". On screen, the prompts change to match whatever you last touched: "Hold F" becomes "Hold X" (`GLYPHS`).

## Shaping a stick

Feed a stick's raw numbers straight in and it feels awful. Three fixes, all numbers in `GAMEPAD`:

- **Dead zone** (0.15). A stick at rest never reads exactly 0: springs wear and sensors drift. Without a dead zone you'd slowly turn forever. Anything under 15% tilt counts as nothing. It's measured on the stick's distance from the middle (a "radial" dead zone), not each axis on its own, so diagonals don't snap to straight lines.
- **Response curve** (squared). Small tilts should turn you slowly, for fine aim; big tilts quickly. Squaring the tilt does it: half way over gives a quarter of the speed. Moving doesn't use the curve: half tilt walks at half speed, as you'd expect.
- **Turn boost.** Held all the way over for 0.3 s, turning speeds up by 70% over the next half second. So you can spin round fast without making fine aim twitchy.

## Aim assist: a little help, never a hand on the wheel

A thumb on a stick is far less precise than a hand on a mouse. Most console shooters help a little. Ours does the gentlest kind: while your sights are over an enemy you can actually see, turning slows to 45% (`assistSlow`, `aimAssist()` in `src/mission.js`). It's like a slightly sticky patch on the target: easier to stay on, but it never pulls your aim anywhere. It uses a sight ray (lesson 8), so it doesn't stick to enemies behind walls. You can turn it off in Settings (Controller aim assist).

## Rumble and the menus

- **Rumble:** the controller shakes when you fire, get hit, go down, or something explodes nearby, through the browser's `vibrationActuator` where the controller has one. Settings → Controller vibration switches it off.
- **Menus:** with a controller, focus moves between buttons in the direction you push (the nearest button that way), A clicks, B goes back, and left and right change sliders and choices. Held directions repeat, a little slower the first time, like a keyboard's key repeat.

## Try this

1. Plug in a controller (or pair one by Bluetooth) and press a button: the title screen's prompts switch to controller buttons.
2. Settings → Controller look speed: try 50% and 200%.
3. Hold the right stick all the way over and feel the turn boost kick in.
4. Settings → Controller aim assist off, then on: sweep your sights across a frozen enemy on the Compound (Tuning panel → AI → Freeze enemies).

## Common mistakes

- **No dead zone.** The view creeps by itself.
- **Square dead zones** (each axis on its own). Diagonals stick to the axes.
- **A straight line from tilt to turn speed.** Either fine aim or fast turns, never both.
- **Aim assist that moves your aim for you.** It feels like being driven; slow the turning instead.
- **A separate rule path for controllers.** Make the same commands as the keyboard, and the simulation never needs to know.
