# Lesson 9: Pathfinding and cover

**The idea in one sentence:** when the level loads, we draw the enemies a map of everywhere they can walk and everywhere they can hide; during a fight they use a sat-nav (A*) to plan routes across it and a couple of rays to check which hiding places actually hide them from you.

## The map: a navigation grid

Enemies don't see the level the way you do. All they have is the physics engine's invisible shapes. So `src/ai/nav-grid.js` builds them a map when the level loads:

1. **A chessboard.** Lay an imaginary grid over the level, squares 40 cm wide.
2. **Drop a marble.** Over every square, drop an imaginary marble from the sky (a ray straight down) and note **every** floor it touches, not just the first. That's how a two-storey house works: the ground floor and the upstairs floor sit in the same column as separate "layers".
3. **Does a person fit?** Check each landing spot with a person-sized invisible cylinder. Too close to a wall, under a low ceiling, or inside a crate: not walkable.
4. **Join neighbours.** Link next-door cells you could step between. Each half of the step may rise at most 35 cm (the same step height you have). So stairs and ramps join up, but the top of a waist-high wall doesn't.
5. **Islands.** Cells that can't reach the main area (the top of a container, a closed room) are numbered as separate islands and ignored.

The Compound's grid has about 56,000 cells and takes under half a second to build. Tick **Show the nav grid** in the tuning panel (AI) to see it.

Big studio engines use a **navmesh** instead: the same idea, but with large polygons instead of small squares. Squares are easier to understand and easy to build from rays, and they're plenty for our maps.

## A*: the sat-nav

Finding a route means searching the links. You could try every direction equally, spreading out like a ripple in a pond, until you reach the goal. That works, but it explores the whole map.

**A\*** ("A star", in `src/ai/astar.js`) is smarter. It keeps a to-do list of squares and always explores next the one that looks most promising, scored by:

```
cost so far  +  distance still to go "as the crow flies"
```

The crow-flies part is the **heuristic**. Because it never *over*estimates (a route is never shorter than a straight line), the first time A* reaches the goal it has found the shortest route. A sat-nav works the same way. A route across the Compound typically explores a few thousand squares and takes about a millisecond.

Two small extras:
- Squares hugging a wall cost a little more, so routes keep off walls the way people do.
- A flanker's search can mark a circle around you as expensive. It then plans a route that swings wide round you instead of walking into your sights.

## Pulling the string tight

The raw route zig-zags from square to square, like a staircase. Hold a string at both ends of that route and pull it tight: it skips every corner it can, wrapping only round the real obstacles. That's **string pulling** (`smoothPath()`): keep only the corners you can't walk straight past. A route of 240 squares becomes 5 or 6 waypoints.

## Following the route

The motor walks towards the next waypoint and ticks it off once it's close. It also:
- **doesn't bunch up:** a gentle push away from anyone closer than about a metre, so a squad doesn't jam in a doorway
- **gets unstuck:** if it hasn't moved for a second, it asks for a fresh route. If it's still stuck, the brain gives up on that destination and picks another.

## Cover points

Also at load time, `src/ai/cover.js` looks at every walkable cell that's right beside something solid and shines two short sideways rays at it:

| Ray hits at | Means |
|---|---|
| 0.9 m (knee to waist) | **low cover**: crouch behind it, stand up to shoot over it |
| 1.55 m too (head height) | **high cover**: stand behind it, step out to the side to shoot |

For high cover, it also remembers a **peek spot** just past the edge of the wall. The Compound has about a thousand cover points. Tick **Show cover points**: yellow is low, orange is high, with a tick pointing at the wall.

## Choosing cover in a fight

When an enemy wants cover, it scores the cover points nearby:
- **Safe?** Is the line from your eyes to its hidden head blocked? (A ray.)
- **Useful?** Can it pop up, or step to the peek spot, and see you? (Another ray.)
- **Sensible?** Not too far to run, at its favourite range (close for Rushers, far for Marksmen), not where a squad-mate already is.
- **Flanking?** A flanker wants a wide angle from where its squad is, so you're caught from two sides.

Then, while in cover, it keeps checking. If you walk round so the wall no longer hides it, the cover is "flanked", and it shouts "Moving!" and finds new cover. That's why flanking *them* works.

## A real bug from building this

A test checked that an enemy could walk up some stairs onto a platform. It couldn't. Printing the grid cell by cell up the stairs showed a strange "floor" at ground level under the front edge of the bottom step, where nobody could possibly stand, because the step is in the way.

The marble ray had found two floors in that column: the top of the step, and the ground underneath it. The "does a person fit?" cylinder starts a step's height above the floor, so stair edges don't count as blocking. That's exactly why it didn't notice the step sitting on the phantom floor. The phantom cell then linked to the ground in front, the real step linked to the stairs, and the two never met.

The fix: ignore any floor with another surface less than a person's height above it. A second stairs bug turned up in the Compound: stairs with 30 cm deep steps were rejected for a similar reason, so the level kit now notes that stairs for enemies need steps at least 35 cm deep. **Lesson: when a test fails, print what the code actually built and look at it.**

## Try this

In the Compound, tuning panel (`` ` ``) → **AI**:

1. Tick **Show the nav grid**. Find the drain in the west wall: no green there. Enemies can't follow you through it.
2. Tick **Show routes**, then get spotted and run. Watch the blue routes bend round containers.
3. Tick **Show cover points**, then hide behind a container and watch where the riflemen go.
4. Flank a rifleman in cover and listen for "Moving!".

## Common mistakes

- **Walking through walls.** Never let AI move in a straight line to its target. Always go through the nav grid.
- **Heuristics that overestimate.** A* then finds a route, but not the shortest one.
- **Routes hugging walls and corners.** Agents snag. Add a small cost near walls, and smooth the route.
- **Cover that only works from one side.** Re-check cover against where the player is *now*, not where they were when the enemy chose it.
- **Searching the whole map every tick.** Cache routes and only search again when the destination really changes.
