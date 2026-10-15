# Lesson 2: 3D space and vectors

**The idea in one sentence:** every position, direction and speed in the game is a set of three numbers (x, y, z), and almost all game maths is adding, scaling and comparing those triples.

## Our coordinate system

- **Units are metres.** A door is about 2 units tall. The Proving Ground's floor grid is 1 m per square, so you can count.
- **Y is up.** `y = 0` is the ground.
- **North is -Z.** You spawn facing north, down the sprint lane. East is +X.

A **vector** is just an (x, y, z) triple. It can mean a *position* ("I'm at x = 3, y = 0, z = -10"), a *direction* ("north" is (0, 0, -1)), or a *velocity* ("5 m/s north" is (0, 0, -5)).

## Looking around: yaw and pitch

Your view direction is two angles:

- **Yaw** is turning left and right, like shaking your head "no". Yaw 0 faces north.
- **Pitch** is looking up and down, like nodding "yes". It's limited to just under ±90°, so you can't flip upside down.

Moving the mouse changes these (`src/core/input.js`). The game turns them into a "forward" vector:

```js
const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // forward
const rx =  Math.cos(yaw), rz = -Math.sin(yaw); // right
```

Then pressing W + D means "forward plus right":

```js
let wx = fx * moveZ + rx * moveX;
let wz = fz * moveZ + rz * moveX;
```

## Why diagonal running isn't faster

Forward (1, 0) plus right (0, 1) is (1, 1), and the length of that is √2 ≈ 1.41. So without care, running diagonally would be 41% faster, a famous bug in old games. We **normalise** the direction (divide by its length) so it always has length 1. There's a test for it: `diagonal movement is not faster than straight movement` in `tests/unit/movement.test.js`.

## Normals: which way a surface faces

A **normal** is a vector of length 1 pointing straight out of a surface. A floor's normal is (0, 1, 0), straight up. A wall facing you has a normal pointing at you. The movement code uses normals to tell floors (pointing up) from walls (pointing sideways) from ceilings (pointing down), and to work out which way is downhill when you slide.

## The dot product: "how much of this goes that way?"

`a.x*b.x + a.y*b.y + a.z*b.z` measures how much two directions agree: 1 for the same way, 0 for sideways, -1 for opposite. We use it constantly. One example from `src/player/controller.js`, sliding along walls:

```js
const into = vel.x * nx + vel.z * nz;  // how much of our speed goes into the wall
if (into < 0) { vel.x -= nx * into; vel.z -= nz * into; } // remove just that part
```

You keep the part of your speed that runs *along* the wall, so you glide instead of sticking.

## Try this

1. Open the tuning panel and turn on **Debug views → Third-person camera**. You'll see your body, the yellow cylinder, from behind. Its little dark "nose" points where your yaw points.
2. Turn on **Show colliders** too. The lines are what the physics engine sees.
3. In **Settings**, try field of view 70 and then 120. That's the angle of the view cone the camera sees.

## Common mistakes

- **Mixing up degrees and radians.** Code uses radians (a full turn is 2π ≈ 6.28). Settings show degrees because people think in degrees.
- **Forgetting to normalise a direction** before multiplying it by a speed.
