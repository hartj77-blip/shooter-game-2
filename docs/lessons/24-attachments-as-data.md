# Lesson 24: Attachments as data

**The idea in one sentence:** an attachment is a list of changes to a gun's numbers, applied to a copy of the gun's row, so every rule that already uses those numbers just works and nothing ever asks "has it got a suppressor?".

## A pencilled-in recipe

Every gun is a row of numbers in `src/weapons/weapons-data.js` (lesson 5): spread, recoil, magazine size, reload times, zoom, noise. An attachment in `ATTACHMENTS` (`src/weapons/attachments.js`) is a short list of edits to those numbers:

```js
extended: { slot: 'mag', mods: [['mag', 'mul', 1.5], ['reload', 'mul', 1.15]] }
```

"The magazine holds 1.5 times as many, reloading takes 15% longer." `'mul'` multiplies, `'set'` replaces (a sight's zoom). `withAttachments(gun, picks)` copies the gun's row and applies the edits. From then on the spread rule, the recoil rule and the reload rule all read the new numbers without knowing anything changed. It's a recipe card with a substitution pencilled in: the cooking is the same, the quantities aren't.

| Slot | Choices |
|---|---|
| Optic | Red dot (zoom 1.45×), holographic (1.6×, a touch slower to raise), 2× scope (2.2×, much tighter aimed spread, slower) |
| Muzzle | Suppressor (heard 0.45× as far, no flash, a little less range), compensator (25% less kick, louder) |
| Magazine | Extended (+50% rounds, slower reload), fast mag (25% quicker reload) |
| Underbarrel | Foregrip (steadier recoil, tighter aim), laser (better from the hip, but it shows at night) |

`FITS` says what fits what (no 2× scope on a shotgun; the DMR's scope is built in).

## Rules from data, a few flags for the rest

Most effects are just numbers. A few are **flags**, plain facts copied onto the gun: `suppressed`, `laser`, `optic`. They're read by a handful of rules:

- `suppressed`: the shot's noise is already smaller (a number), but at night a muzzle flash lights you up (lesson 21), and a suppressor hides it. The enemies' `playerShots` checks the flag. The sound is muffled too (a low-pass filter, `muffle`, in `src/audio/audio.js`).
- `laser`: at night your laser dot counts as being lit (`LIGHTING.laser`).
- `optic`: the drawing code fits the right sight.

## Same picks, same gun, on every computer

Attachments change how a gun plays, so in co-op the host and your browser must build exactly the same gun, or prediction disagrees (lesson 12). So each browser sends its **loadout** with `loaded` (`src/net/room.js`), the host checks it (`cleanArsenal`: real guns, each once, attachments that fit) and builds your soldier's guns from it, and your browser builds the same ones. `withAttachments()` is **deterministic**: the same picks always give the same numbers (there's a test).

The host checks the loadout's *shape*, not whether you've unlocked it. Your progress lives in your browser (lesson 23), and co-op is among friends.

## Drawn from the same data

`buildGun()` (`src/render/gun-models.js`) reads `def.attachments` and adds code-built parts at each gun's points (`GUN_MODELS`): a sight housing on the `sight` point, a suppressor tube on the `muzzle` (which moves the muzzle point forward, so the flash comes out of the end), a longer magazine that drops out with the rest of it, a foregrip or a laser under the `support` hand. Teammates are drawn with theirs too: the room's roster shares everyone's loadout.

A 2× scope brings back the **scope view**: in the last part of aiming you're looking *through* it, so the gun disappears and the HUD draws a round window with crosshairs. Like putting your eye to a telescope: you stop seeing the telescope.

## A real bug: a shotgun with NaN reload

The magazine attachments first said `['reload.tactical', 'mul', 1.15]`. The new attachment test fits every attachment to every gun it fits and checks each number, and it failed on the shotgun. The shotgun loads one shell at a time: its reload has `start`, `perShell` and `end` times, and no `tactical` at all. `undefined × 1.15` is `NaN` ("not a number"), and a `NaN` reload would have frozen the gun mid-reload forever.

Two guns with differently shaped data. The fix is a path that means "every reload time this gun has" (`'reload'`, with the list in `RELOAD_TIMES`), so one attachment works on both kinds of gun. The lesson: when data comes in more than one shape, test every combination, not just the common one.

## Try this

1. Console: `fireteam.profile.awardGun('carbine', 1e6)`, then open **Loadout** and fit everything. Each pick says what it changes, worked out from its own data (`describeAttachment`), so the description can never disagree with the effect.
2. Fit the extended magazine, play the Compound, and count to 45.
3. Fit a suppressor and play Lifeline at night: fire near a guard who hasn't seen you.
4. Fit the 2× scope and aim all the way.

## Common mistakes

- **`if (gun.hasSuppressor)` all over the code.** Change the numbers instead; keep flags for the few things numbers can't say.
- **Editing the table's own row.** Every gun of that kind (and the tuning panel) would change. Copy it.
- **Assuming every gun's data has the same shape.** Test every attachment on every gun.
- **Building a gun from local choices on only one computer.** Send the loadout, and build it the same way on both.
