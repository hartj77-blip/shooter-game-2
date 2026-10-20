// Mission modifiers: optional rules that make a mission harder, for more XP.
//
// Like house rules in a board game ("no passing Go money"): the game is the
// same, one or two rules change, and everyone at the table agrees first. Each
// is data: what it changes is read by the part of the game it belongs to
// (game/sim.js passes them on), and `xp` is the bonus it adds (game/xp.js).
//
// Picked on the title screen (solo) or by the host in the lobby (co-op): the
// host decides, like the map and the difficulty.
//
// No DOM: runs in Node.

export const MODIFIERS = {
  ironman: {
    name: 'Iron man',
    text: 'No checkpoints: if the squad goes down, the mission starts again.',
    xp: 0.3,
  },
  scarce: {
    name: 'Scarce supplies',
    text: 'Ammo crates hold half as many refills, and call-ins charge half as fast.',
    xp: 0.2,
    refills: 0.5,
    charge: 0.5,
  },
  lethal: {
    name: 'Lethal',
    text: 'Every bullet does double damage: yours and theirs.',
    xp: 0.3,
    damage: 2,
  },
};

/** A list of modifier ids someone sent or saved, made safe: real ones, each once. */
export function cleanModifiers(list) {
  return Array.isArray(list) ? [...new Set(list.filter((m) => typeof m === 'string' && Object.hasOwn(MODIFIERS, m)))] : [];
}

/** The XP multiplier for a set of modifiers: 1 + each one's bonus. */
export const modifierXp = (list) => 1 + cleanModifiers(list).reduce((s, m) => s + MODIFIERS[m].xp, 0);

/** Is modifier `id` on? */
export const hasModifier = (list, id) => cleanModifiers(list).includes(id);
