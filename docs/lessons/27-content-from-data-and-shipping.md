# Lesson 27: Content from data, and shipping

**The idea in one sentence:** once the systems are data-driven, new content is mostly new data (a mission, a modifier), and finishing a game means deciding what's in version 1.0 and writing down what isn't.

## A new mission type in one function

Lesson 14 made missions data: stages, sites, key moments. Each stage *kind* is one function in `src/game/objectives.js` with the same small shape (`update`, `spots`, `save`/`restore`, `phase`). So "Kingpin", the fifth mission type, was:

1. **One function, `eliminate`.** It spawns the officer and two bodyguards beside a site picked from the seed. The officer is an ordinary enemy soldier, only tougher (`officerHealth`) and marked `hvt` (high-value target). When he's down, the stage is complete.
2. **One entry in `MISSIONS`** (`levels/missions.js`): its sites, its brief, its radio lines. The night version came free (lesson 21).
3. **A line of HUD text and a marker.** The objective HUD reads `operation.view`, and enemies' `view.hvt` reaches every screen through the snapshots.

Everything else (the director, checkpoints, extraction, co-op, XP) already worked, because it never asked *which* job you were doing. A checkpoint retry brings a fresh officer back, for the same reason reinforcements aren't saved: he's made by the stage, not the map.

The test asks the questions that matter for any new content: at every candidate site, can everyone reach the officer and his guards (`nav.component`, lesson 16)? Does downing him end the stage? Does a restart bring him back?

## Modifiers: house rules

`MODIFIERS` (`src/game/modifiers.js`) are optional rules, like house rules in a board game: the game is the same, one rule changes, and everyone agrees first.

| Modifier | What changes | Where it's read | XP |
|---|---|---|---|
| Iron man | No checkpoints | `operation.js` (`checkpoints: false`) | +30% |
| Scarce supplies | Crates hold half the refills; call-ins charge half as fast | `sim.js` (the crates), `callins.js` (`chargeScale`) | +20% |
| Lethal | Every bullet does double damage, both ways | `enemies.js` (`options.lethal`) | +30% |

Each is data plus one line where its rule lives. Pick them on the title screen, or (in co-op) the host picks them in the lobby, like the map and the difficulty. The host decides because the host runs the simulation (lesson 11). The XP bonus is counted in each browser like the rest of your XP (lesson 23).

## Shipping

A game is never finished, only shipped. Fireteam 1.0 is milestones 0–9:

- Movement, shooting, enemies, co-op, five mission types on the Harbour by day and night, the Compound and the Proving Ground.
- Art, progression, polish (settings, touch, automatic quality), and modifiers.

What's *not* in 1.0 is written down in `docs/DESIGN.md` under **Open questions**, so nobody has to remember it:
- host migration
- lag compensation for public games
- enemy grenades and call-ins
- more maps

That list is the start of version 2.

## Try this

1. Play Kingpin on Recruit. Then with Lethal on. Then add Iron man.
2. Make your own mission: copy Kingpin in `levels/missions.js`, give it a new `id` and `title`, change its `sites` to `['net-shed', 'chapel', 'smokehouse']` and its radio lines. It appears in the map list. (Run `npm test`: the Harbour test checks every mission starts.)
3. Invent a modifier: add a row to `MODIFIERS` and find the one line that reads it.

## Common mistakes

- **A new mission type that special-cases other systems** ("if eliminate, then…"). Give it the same shape as the others, and the rest of the game needn't know.
- **Content nobody can reach.** Test every candidate site, not the one you happened to play.
- **Modifiers decided on each computer.** One computer runs the rules; in co-op that's the host.
- **"Done" without a list of what's left.** Write it down.
