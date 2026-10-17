# Lesson 25: Call-ins and fair area effects

**The idea in one sentence:** a call-in is support you earn and aim, decided entirely by the host, and the ones that affect an area play fair: they warn first, they never hurt your own squad, and smoke blocks eyes with a collision group that bullets don't meet.

## Earn it, aim it, wait for it

Your loadout has one **call-in** (`src/game/callins.js`):

| Call-in | What happens |
|---|---|
| Supply drop | a crate falls by parachute (6 s); once it lands it's an ammo crate |
| Recon drone | a drone circles the spot for 25 s and marks every enemy within 35 m for the whole squad |
| Mortar strike | red smoke marks the spot; 3 s later four shells land within 6 m |
| Smoke screen | a line of four smoke clouds, 25 s, that nobody can see through |

You don't start with it ready. Your **charge** fills from kills, objectives, and slowly by itself (`CALLINS.charge`); full, press **T** (View on a controller). Each use makes the next charge fill a little slower (`slower`), so they stay special. Then there's a short radio wind-up before it arrives.

## Aiming: a ray from your eyes

Pressing T sets a `callin` flag in your command, like a ping (lesson 11). The host casts a ray from your eyes along your view, against the level only (`LEVEL`), up to 60 m. Hit a wall? It steps back off the wall a little and drops to the floor. Supply drops and mortars come from the sky, so the host also checks straight up for **open sky**. Too far, still charging, or a roof overhead: refused, and only you are told why (`callin:refused` is a personal event, `PERSONAL` in `src/net/protocol.js`).

## The host decides, everyone draws

The host decides everything: who called what, where, and when each shell lands (from the seeded random, so a replay lands them in the same places). Clients get a small `view` of what's happening in each snapshot (`ci`), plus `callin:*` events, and draw it (`src/render/callins-view.js`). The usual rule (lesson 11): presentation reads views, never the simulation's insides.

## Fair area effects

Something that hits an area is only fun if you can see it coming. The mortar follows the same fairness rules as the enemies (lesson 8):

- **A warning first.** Red smoke rises from the mark for 3 s before the first shell, and every screen shows a "Mortar" marker. Shells whistle as they fall.
- **Nobody on your side is hurt.** The shells use the grenade's blast (`explode` in `src/game/sim.js`, lesson 17), which never hurts players or the hostage.
- **The other side gets the warning too.** The mark is added to the enemies' **hazards**, like a grenade landing: guards who see the smoke may run (`ai/senses.js`, `ai/brain.js`). A strike on a group that's paying attention scatters them rather than wiping them out.

## Smoke: a new guest list

Lesson 10 introduced **collision groups**: every physics question only "sees" some kinds of collider. Smoke needed a new kind:

```
SMOKE   member of: SMOKE     met by: SIGHT only
```

Each cloud is a ball collider in the `SMOKE` group. `SIGHT` (eyesight: the enemies', and your controller's aim assist) now meets `WORLD | SMOKE`, so eyes stop at smoke. `BULLET` doesn't meet it, so bullets fly straight through: you can shoot blind into the smoke, and so can they. `MOVE` doesn't meet it, so you walk through. It's one number per kind of question, and the whole game follows.

Choosing which questions see smoke turned up two old shortcuts. Hearing used `SIGHT` to ask "is there a wall between me and that noise?" (a wall muffles a sound), and footsteps used it to find the floor. Smoke doesn't muffle sound and isn't a floor, so both now ask `LEVEL`. When you add something new to a shared rule, check every place that uses the rule.

A client adds the same smoke colliders from the view, so its aim assist can't see through smoke either.

## A real bug: invisible smoke

The first smoke screen worked perfectly in the tests (eyes blocked, bullets through) and was invisible in the browser. The drawing code builds each call-in's picture the first time it appears in the view. A call-in first appears while it's still on its way (`inbound`), and its clouds are only placed when it arrives. So the smoke's picture was built from an empty list of clouds and never rebuilt. The fix: build the clouds the first time they're known. Data that arrives later than the thing it belongs to is common in networked games; draw from whatever you have *now*.

## Try this

1. On the Proving Ground call-ins are always charged. Open the console and type `fireteam.session.sim.callins.player(0).kind = 'smoke'`, look at the ground and press **T**. Walk through it.
2. Try `'mortar'` on the Compound, looking into a building: refused. Then out in the open.
3. On the Compound, `'recon'`: watch the red diamonds through the walls.
4. Tuning panel → Missions → Call-ins: make the mortar's warning 0 s and feel how unfair it is.

## Common mistakes

- **Area damage with no warning.** If players can't see it coming, it feels like a cheat, whichever side it's on.
- **Friendly fire by accident.** Decide who an area effect hurts, and test that it doesn't hurt anyone else.
- **Blocking sight with a wall.** Then bullets stop too, and people stand on it. Use a group only eyesight meets.
- **Letting the client decide.** Only the host decides what lands where; everyone else draws its view.
