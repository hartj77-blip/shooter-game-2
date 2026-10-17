# Lesson 21: Seeing in the dark

**The idea in one sentence:** the darkness the enemies "see" is a simple sum the simulation can work out the same way every time, while the darkness you see is drawn with real and fake lights; keep the two separate, and stealth at night is fair.

## Night missions

Every Harbour mission comes at night too: the Day/Night switch on the title screen, or the "at night" missions in the lobby. A night mission is the same mission with:
- `night: true` and the night mood (`missionLevels` in `levels/missions.js`)
- its own map id (`harbour-rescue-night`), so links, the lobby and remembering your last map all work as before
- the lamps lit

## Two kinds of darkness

What you see at night and what the enemies "see" are worked out separately, on purpose:

| | Your screen | The enemies' eyes |
|---|---|---|
| Where | `src/render/night-view.js`, `render/post.js` | `src/world/lighting.js`, `src/ai/senses.js` |
| How | real three.js lights, glowing shapes, see-through cones, night vision | a few lines of arithmetic |
| Runs on | every computer, each drawing its own picture | the host only (lesson 11) |
| Must be the same everywhere? | no | **yes** (and in the tests) |

The graphics card's lighting can't decide the game: it differs between computers and quality settings, and there's none at all in Node, where the tests run. So the simulation keeps its own simple **lighting plot**, like a stage manager's sheet that says "the area under lamp 3 is bright", with no light involved at all.

## lightAt: how lit is a spot?

`lightAt(pos, lighting, firedAgo)` in `src/world/lighting.js` gives a number from 0 (pitch dark) to 1 (daylight):
- **Moonlight:** by day everything is 1. At night, open ground is `LIGHTING.night` (0.15).
- **Lamps:** each `lamp` piece (lesson 20's kit) lights a circle of its `radius`. Fully bright in the middle 40%, fading to moonlight at the edge.
- **Your muzzle flash:** for 0.4 s after you fire, you're lit up (0.85), wherever you are.

Then, for each enemy looking at you, there's one more: their own **flashlight**. It's a cone ahead of them, 22 m long and 14° either side of where they face. If you're in it, you're lit for *that* enemy (`flashlightOn`). Their squad-mates don't get it, unless they're pointing their own torch at you.

## What darkness does to the enemies

`ai/senses.js` takes the brighter of "how lit you are where you stand" and "in this enemy's beam", and:
- **Sight range shrinks:** to 35% of daylight in full darkness (`darkSight`).
- **Noticing slows:** awareness (lesson 8's kettle) heats up 30% as fast in full darkness (`darkRate`).
- **"Right in front of me" gets closer:** the distance at which they spot you at once shrinks the same way as sight.

By day the light is 1 everywhere, so all three multiply by exactly 1: day play is unchanged, and every older test still passes untouched. That's a good way to add a feature to a working game: make the new rule a no-op where it shouldn't apply.

### Fair stealth

Darkness must hide you in a way you can understand and read, or it just feels random. So the rules are ones you can see on screen:
- The lamps you see are the lamps they use.
- Their torch beams are drawn, so you can see when you're in one.
- Firing gives you away, and you can see your own muzzle flash.

The existing fairness rules (reaction time, warning shots, telegraphs; lesson 8) all still apply once they've spotted you.

### A real bug in a test: the guard who glanced away

The first test put a guard facing south and the player straight in front of them, inside the torch beam. It expected them to notice you much faster than a player standing off to the side in the dark. It didn't: 0.31 against 0.28. A trace showed why. Idle guards **glance about**, and within half a second this one had turned 47° away, swinging the beam off the player. The game was right; the test assumed a statue. Now the test holds the guard's gaze south each tick (`tests/unit/lighting.test.js`), and the difference is clear. When a test fails, find out whether the code or the test's idea of the world is wrong.

## Drawing the night: fake most of it

Real lights are expensive. Each one adds work for every pixel it might touch. Worse, changing how *many* lights a scene has makes three.js rebuild its shaders, a visible stutter. So `night-view.js` works like a theatre with six spotlights to go round:
- There are always exactly six real spotlights (`NIGHT_VIEW.lights`).
- Each frame they're handed to whichever lamps and flashlights are nearest you (torches count as a bit nearer: they move, so you notice them).

Everything else is **faked**:
- **Bulbs:** little shapes in a colour brighter than white, so they bloom on high quality.
- **Pools of light under lamps:** soft, see-through discs painted on the ground, all merged into one mesh.
- **Torch beams:** faint, see-through cones that fade towards the far end, all drawn in one go as an **instanced mesh** (one shape, many copies, one draw call).

### Dark, not black

The first night was black: you could see the lamps and nothing else. Darkness that hides everything isn't scary, it's just frustrating. The night mood (`render/moods.js`) was brightened until shapes read in moonlight: a stronger blue moon, more light from the sky, a little more exposure. Dark enough that lamps and torches matter; light enough to find your way.

## Night-vision goggles

Press **N** (or D-pad down) to flip them down. It's all in the grade pass of `render/post.js`:
- one brightness, amplified (`nvgGain`)
- a little random grain each frame, like a real image intensifier's noise
- tinted phosphor green
- with heavy dark corners

They work on low quality too: the post-processing chain switches on just for them.

The goggles only change **your own screen**. In co-op nobody else needs to know, and the enemies don't care. If they changed what the simulation did, every computer would have to agree on who wore them when (lesson 12). Presentation only, so co-op can't disagree.

## Try this

1. Play Lifeline by day, then at night. Sneak to the village along the dark side of the road; then try walking under the lamps.
2. Tuning panel → AI → In the dark: set **Moonlight** to 1. The night still looks dark, but now the enemies see as if it were day. Set it to 0 and they can barely see past their torches.
3. Fire one shot in the dark near a guard (from a safe distance) and watch the "?" appear.
4. Flip the goggles down under a lamp, then out in the dark.
5. In the console on a night mission: `fireteam.enemies.ai.lighting.lamps.length`.

## Common mistakes

- **Letting the graphics card decide the game.** What's drawn differs between machines; the simulation needs its own, simple rules.
- **Darkness nobody can read.** Show the lights the rules use.
- **Adding and removing real lights.** Keep a fixed set and move them about.
- **Black instead of dark.** If the player can't see where to go, the darkness has stopped being a challenge.
- **Putting presentation choices into the simulation.** Goggles are a filter, not a rule.
