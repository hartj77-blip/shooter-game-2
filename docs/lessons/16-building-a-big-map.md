# Lesson 16: Building a big map

**The idea in one sentence:** a big map is planned around landmarks, routes and sightlines, blocked out in rough shapes first, checked by tests rather than by hope, and drawn in batches so the computer can keep up.

## The Harbour

The Harbour (`levels/harbour.js`) is about 170 × 125 m: nearly five times the Compound. A small fishing port taken over by a private military company:

| Area | What's there | Missions |
|---|---|---|
| **South** (the start) | The road in, a berm you start behind, the fence with three gates | Everyone starts here, out of sight |
| **West: the village** | Narrow alleys, net sheds, a chapel with a red roof, a smokehouse, a square | Where the hostage is held |
| **Centre: the container yard** | Stacked containers in rows, a car park with the landing zone | Caches; the LZ for three missions |
| **East: warehouses and the office** | Warehouse A with a mezzanine floor, warehouse B, the white two-storey harbour office | Where the laptop is |
| **North: the quay** | Cranes, the dock hut, a jetty, and the lighthouse on its headland | Caches, the hold, the headland LZ |

The sea is just for looks: invisible walls along the quay (`boundary` pieces, in their own collision group so only *walking* meets them) stop you stepping off.

## Landmarks, sightlines and choke points

On a small map you can see everything. On a big one, players get lost, so the map has to tell them where they are. Level designers use a few ideas:

- **Landmarks**: big, unique things you can see from far away. The Harbour has four: the two cranes (north), the lighthouse (north-east), the chapel's red roof (west), and the white harbour office (east). Like a church spire in a town, you can always point at one and know which way you're facing.
- **Sightlines**: how far you can see (and be seen) along a line. The container yard's long rows are sightlines for the Marksman; the village alleys are short ones for close fights. Mixing them gives each mission different moments.
- **Routes and choke points**: there's always more than one way between two places (the alleys or the main road; the yard or the quay), and a few narrow places where routes meet: the gates, the warehouse doors, the headland path. Choke points are where fights happen, and where a hold-the-line mission is decided.

## Blockout: rough shapes first

Every building in the Harbour is made of grey-textured boxes (`docs/DESIGN.md`: "grey-box until M6"). That's deliberate. A **blockout** is a map made of rough shapes, like a sketch before a painting. It lets you test the important questions (can I get there? can they see me? is this fight fun?) before anyone spends a week on art. Moving a box is a one-line change; moving a finished building isn't.

The Harbour is plain data, like every level: walls with openings, boxes, stairs, sites, entry points, crates and enemies (`src/world/kit.js`). Small helpers inside the file (`room()`, `house()`, `door()`) keep it readable.

## Let the tests walk the map for you

On a map this size you can't check every corner by hand after every change. `tests/unit/harbour.test.js` does it on every push:

| Test | What it catches |
|---|---|
| Everything a mission needs can be reached on foot | A guard on an unreachable roof, a site behind a wall, a crate in a corner the nav grid missed |
| Reinforcements' routes start and end on the map | An entry whose route walks into the sea |
| The hostage can walk from every site to the helicopter | A doorway too narrow for them |
| Nobody can see where you arrive, even after a while | An unfair start |
| Every mission's sites exist and its first objective starts | A typo in a site's name |
| A 4-player snapshot at the enemy cap fits the budget | Co-op getting too big for the network |

### The nav grid at scale

The Harbour's nav grid (lesson 9) has about 130,000 walkable cells, more than twice the Compound's, and still builds in under a second. Two things needed care:

- **Floors.** The grid keeps at most 4 floors in any column (a top-down list of heights), so the map never stacks more than 4 walkable surfaces above one spot.
- **"Can I walk there?"** On the Compound, the tests asked A\* (lesson 9) for a route from the start to every enemy. A\* gives up after exploring 60,000 squares, so it doesn't spend forever on impossible requests. On the Harbour, a route from one corner to the other can need more than that. So the tests ask a better question instead: **is it on the same island?** When the grid is built, it labels every connected piece of map (an **island**, or "component"). If the start and the crate share a label, there's a way between them, however long. It's like checking two towns are on the same continent before planning the drive.

## A real bug: the crack between the stairs

The reachability test said the upstairs of the harbour office couldn't be reached. Yet you could walk up its stairs perfectly well.

The nav grid links two cells on a slope by dropping a ray halfway between them to check there's floor there (`canStep` in `src/ai/nav-grid.js`). Each stair step is its own box. On the office stairs, by bad luck, the halfway point between two cells landed *exactly* on the line where two steps meet. Numbers in a computer are stored with limited precision (the physics engine uses 32-bit "floats", good to about 7 digits). A ray down that line could slip through the hairline crack between the two boxes and hit nothing, so the grid decided "a gap!" and cut the stairs in two.

The fix: if the halfway ray finds nothing, try 5 cm either side before calling it a gap. A regression test builds stairs whose step edges line up exactly with the grid (the office's own numbers), and fails without the fix. **"Exactly on the boundary" is a special place in floating-point maths.** Test it on purpose.

## A real bug: restarting in mid-air

Each site has a **safe spot**, where the squad restarts after retrying from its checkpoint. The warehouse's mezzanine site said where to stand as `[x, z, yaw]`, and the code took the height from the site itself: the mezzanine, 3 m up. But the safe spot was down on the warehouse floor, under nothing. Retry, and the whole squad appeared 3 m in the air and dropped. The reachability test caught it ("site mezzanine's safe spot is mapped at the right height"). Now a safe spot is on the ground unless it says otherwise (a fourth number).

## Draw calls: one trolley per shop

Every separate mesh costs a **draw call**: the computer stops and tells the graphics card "now draw this, with this material". Each call takes time, whatever its size. It's like shopping one item per trip: the travelling, not the shopping, is what takes the time.

The level used to be drawn one piece at a time: 328 pieces on the Harbour, each drawn twice (once more for shadows). Now `src/render/level-view.js` **batches** them: pieces with the same material are joined into one mesh. One trolley per shop.

But not one mesh for the whole map. three.js skips anything outside the camera's view (**culling**), checking each mesh as a whole. A single map-wide mesh is always partly in view, so it's always drawn, all of it. So the batches are per material *per 32 m tile*: a tile behind you is skipped in one go.

| Harbour, one frame from the start | Before | After |
|---|---|---|
| Low quality | 365 draw calls | 200 |
| High quality | 408 | 229 |

Most of what's left is the soldiers. Each is about a dozen moving parts (lesson 10), and parts that move separately can't be joined. A smoke test (`tests/smoke/game.spec.js`) fails if the Harbour goes over 260 calls on low quality, so batching can't quietly break.

## Try this

1. Open the Harbour with the tuning panel and turn on **Debug views → colliders**: every shape the physics sees, including the invisible walls along the quay.
2. In the console: `fireteam.view.renderer.info.render.calls` gives the calls in the last thing drawn. Look around and compare.
3. In `src/render/level-view.js`, change `TILE` to 1000 (one batch per material for the whole map) and to 8 (lots of small ones). Count the calls with your back to the map, and facing it.
4. Find the four landmarks from the start, without moving.
5. In `levels/harbour.js`, move a crate inside a closed room and run `npm test`. Watch the reachability test name it.

## Common mistakes

- **Building the art first.** Make it fun in grey boxes, then make it pretty.
- **No landmarks.** If every street looks the same, players spend the mission lost.
- **Trusting your eyes on reachability.** A test that walks to every important spot finds the one you forgot.
- **Asking A\* "can I get there?" on a huge map.** Ask "same island?" instead.
- **One giant batch.** Fewest draw calls, but nothing can be culled. Batch by area too.
- **Floats exactly on a boundary.** Nudge, or test both sides.
