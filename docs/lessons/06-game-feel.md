# Lesson 6: Game feel ("juice")

**The idea in one sentence:** a gun feels powerful because of dozens of small reactions (kick, flash, sound, shake, sparks, a tick on the crosshair) layered on top of the simple rules from lesson 5.

Take any of them away and nothing *works* differently, but the game feels cheaper. Designers call this layer **juice**.

## Recoil versus spread

They're often mixed up:

| | Recoil | Spread |
|---|---|---|
| What it is | The gun kicks **your view** up and sideways | Bullets land **randomly** inside a cone |
| Can you fight it? | Yes: pull the mouse down | No: only by firing slower, aiming or stopping |
| Where | `shoot()` in `src/weapons/gun.js` | `spreadDirection()` in `src/weapons/arsenal.js` |

Recoil follows a **pattern** (a repeating list of sideways kicks) plus a little randomness, so good players can learn to control it. Part of it drifts back on its own when you stop (`recover`), and the rest is yours to pull down.

## The gun on your screen (the viewmodel)

The gun in your hands is drawn in a **second pass**, with its own camera, on top of the world (`src/render/viewmodel.js`). The depth is cleared in between, so the gun can never poke through a wall you're standing against. Its camera has a fixed field of view, so the gun looks the same whatever FOV you pick in Settings.

## Springs: the secret behind most animation

Nearly everything the gun does is a **spring**. A spring pulls something back towards its resting place. Give it a kick and it snaps back, overshoots a little, and settles:

```js
velocity += (-stiffness * position - damping * velocity) * dt;
position += velocity * dt;
```

- **Fire:** kick the spring backwards and the muzzle up. It snaps forward again.
- **Turn the mouse:** kick it the other way, and the gun lags behind your aim (**sway**).
- **Land from a jump:** kick it down.

**Stiffness** decides how quickly it snaps back; **damping** decides how much it wobbles. The camera's "shot jolt" and landing dip are springs too.

Poses are blended on top: hip ↔ aiming, sprinting (gun swings across your body), switching (gun drops out of view), reloading (gun tilts, magazine drops out and a new one comes up).

## Aiming down the sights (ADS)

Hold right mouse and four things happen together:

- the gun slides to the middle so the sight lines up with the centre of the screen
- the view zooms in (the gun's `ads.zoom`)
- the mouse slows down to match (the "Aiming sensitivity" setting)
- spread tightens, and you move slower

## Everything else in the juice list

- **Muzzle flash**, a glowing star at the muzzle for 45 thousandths of a second, plus a **muzzle light** that briefly lights nearby walls.
- **Tracers**: every second carbine round streaks along its path. They start from where the muzzle *appears* on screen, worked out by projecting from the gun's camera to the world's camera.
- **Shells** spin out of the side (or when the shotgun pumps), and land with a tinkle half a second later.
- **Impacts** differ by surface: dust and chips off concrete and wood, sparks off metal, a ring off steel. Bullet holes stay on walls.
- **Hitmarkers**: a white ✕ for a hit, gold for a headshot, red for a knock-down, each with its own sound.
- **Shot jolt and shake.** Each shot jolts the camera a touch and adds **trauma**. Shake is *trauma squared*, so small guns barely wobble and a shotgun blast really shakes. It fades on its own.
- **Reduce camera motion** in Settings turns most of this down for players who get motion sick.

## Object pools

A minute of shooting makes thousands of bullet holes, sparks and tracers. Creating new objects and throwing them away makes the browser stop now and then to clean up (**garbage collection**), which shows up as stutters. So `src/render/effects.js` makes a fixed set of each up front: 160 bullet holes, 140 sparks, 32 tracers. When it needs one, it reuses the oldest. A restaurant washes plates instead of buying new ones for every meal.

## A real bug from building this

In the first browser test, firing a few shots made the camera **spin upside down**. The cause was the new shot-jolt spring.

A spring updated in one big step can overshoot. On a normal screen each step is 1/60 of a second, which is fine. The test browser ran at only 2–4 frames per second, so each step was a quarter of a second. The spring overshot, came back even harder, and exploded within a few frames. Someone on a slow laptop would have seen the same.

The fix is to update springs in small steps (1/240 of a second for the camera) however long the frame was. The gun's springs already did this; the camera's didn't. **Lesson: test on slow machines too.** Low frame rates break things that look fine at 60 fps.

## Try this

In the tuning panel (`` ` ``):

1. **Camera feel → Shot jolt** to 0 and **Camera shake** to 0. Fire the shotgun. Then set both to 2.
2. **Weapons → K4 Carbine → Recoil up** to 2. Can you still control a long burst by pulling down?
3. **Weapons → Vanta SMG → Aim zoom** to 2.5. That's a scope.
4. Turn on **Settings → Reduce camera motion** and notice what's left.

## The juice checklist (for every new weapon or action)

- [ ] Something moves (animation, spring kick)
- [ ] Something lights up (flash, glow)
- [ ] Something is heard, with some variety in it
- [ ] The world reacts (impact effect, target falls)
- [ ] The HUD confirms it (hitmarker, ammo counter)
- [ ] It can be toned down for comfort
