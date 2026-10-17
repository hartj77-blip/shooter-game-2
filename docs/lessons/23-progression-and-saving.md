# Lesson 23: Progression and saving

**The idea in one sentence:** progress is a small bundle of numbers (XP, gun XP, your loadout) that the game counts from events it already has, saves in the browser after every change, and never trusts again without checking it first.

## The long game

Each mission is a short game. **Progression** is the long one that ties missions together: every mission earns **XP** (experience points), XP raises your **rank**, and your rank **unlocks** new guns and call-ins. Each gun also earns its own XP when you use it, which raises its **level** and unlocks its **attachments** ("use it to improve it"). It's a loyalty card: every coffee earns a stamp, and enough stamps earn the treat.

All the numbers are tables in `src/game/profile.js`:

| Table | What it says |
|---|---|
| `PROGRESSION` | 20 ranks, 10 levels per gun; each step needs a bit more XP than the last (`rankStep`, `rankGrowth`) |
| `RANK_UNLOCKS` | SMG at rank 2, recon drone 3, shotgun 4, smoke 5, DMR 6, mortar 8 |
| `GUN_LEVEL_UNLOCKS` | each attachment's gun level: red dot at 2 ... 2× scope at 10 |

And what earns XP is in `XP` (`src/game/xp.js`): 100 a kill, +50 for a headshot, 150 a revive, 400 a stage, 1,000 a mission, more on Veteran and at night.

## Counting from events, not adding new rules

We didn't add a single line to the simulation to count XP. The game already announces everything that matters (lesson 4): `enemy:down`, `player:revive`, `objective:complete`, `mission:complete`. `createXpTracker()` just **listens**, keeps the ones whose `owner` is you, and adds them up.

That's also why co-op needed nothing new: those events already reach every browser (lesson 11), so each browser counts its own player's XP. The host doesn't even know your rank. It's like each player keeping their own score card while watching the same match.

## Saving: a note in the browser's drawer

`localStorage` is a small drawer of text the browser keeps for each website, even after you close it. `createProfile()` writes the profile there (as JSON text) after every change, under `fireteam.profile`. No server, no account.

Two things can go wrong with a drawer:

1. **What comes out isn't what went in.** An older version of the game saved a different shape; someone edited it by hand; the browser was closed halfway through writing. So everything loaded goes through `cleanProfile()` first: numbers must be numbers (and not negative), guns must be real guns, and a choice you haven't unlocked yet falls back to the default. A broken save gives a fresh profile, never a crash. **Never trust saved data**: check it like a form someone filled in.
2. **The shape changes.** Each save says its `version`. When a future milestone changes the shape, `migrate()` upgrades old saves one step at a time, so nobody loses their progress.

## The backup code

Browsers keep their drawers separate, so a new computer starts at rank 1. The **backup code** carries a profile anywhere: the profile as text, squeezed into letters and digits (base64url), plus a 4-character **checksum**, like `FT1-eyJ2...-K2Q8`.

A checksum is a short number worked out from all the other characters (we use FNV-1a, a simple, fast mixing recipe). Paste the code and the game works it out again: if one character changed (a typo, a missed letter), the two don't match and the code is refused *before* it overwrites anything. It's the same trick as the last digit of a bank card number.

Find it at the bottom of the **Loadout** screen: *Copy my code* and *Restore*.

## A real bug: the same picks, refused

`setLoadout()` refuses a locked choice outright (quietly swapping it would lose the gun you had). To tell, it cleaned the wanted loadout and compared the two as text: `JSON.stringify(a) === JSON.stringify(b)`.

Then fitting a second gun's attachment was refused. The wanted loadout said `{ smg: ..., carbine: ... }` (the order you fitted them); the cleaned one said `{ carbine: ..., smg: ... }` (the order of the gun table). Same picks, different order, different text. JSON keeps keys in the order they were added, so text comparison is only safe when both sides are built in the same order. The fix builds both in the table's order (guns, then slots), and a regression test fits attachments in every awkward order.

## Try this

1. Play the Compound and drop a few enemies: the debrief shows the XP, and the title screen's rank line moves.
2. Open the console (F12) and type `fireteam.profile.award(20000, 'smg')`: watch the rank jump and the Loadout screen unlock things.
3. Copy your backup code, open a private window, and restore it there.
4. Change one character in the middle of the code and try to restore it: refused, and nothing changed.

## Common mistakes

- **Trusting what you load.** Saved data is input from outside, like a form. Check every field.
- **No version number.** The first time the shape changes, every old save breaks.
- **Counting rewards inside the rules.** Listen to the events the game already makes; the rules stay simple and co-op gets it for free.
- **Comparing objects as JSON text** when their keys might be in a different order.
- **A checksum you never check.** It's only useful if a bad code is refused before anything is overwritten.
