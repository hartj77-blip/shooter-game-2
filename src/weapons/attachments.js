// Attachments: parts you fit to a gun (a sight, a suppressor, a bigger
// magazine...) that change how it behaves.
//
// An attachment is DATA: a list of changes to the gun's numbers in
// weapons-data.js ("aiming zoom becomes 2", "reload takes 15% longer").
// withAttachments() copies a gun's row and applies the changes, and from then
// on every rule (spread, recoil, reloading, noise) just uses the new numbers.
// No rule ever asks "has it got a suppressor?". It's like a recipe card with
// a substitution pencilled in: the cooking doesn't change, the quantities do.
//
// Attachments change the simulation, so in co-op both computers must build the
// same gun: each player's picks travel to the host with their loadout, and
// the same withAttachments() runs on both (it's deterministic).
//
// No DOM, no three.js: this runs in Node.

import { WEAPONS, LOADOUT } from './weapons-data.js';
import { NOISE } from '../ai/noise.js';

/**
 * Each attachment: its slot, and its changes as [path, how, value]:
 *   'set'  the number becomes value       'mul'  the number is multiplied by value
 * Paths are into the gun's row (weapons-data.js), with dots for nested numbers.
 * 'reload' means every reload time the gun has (a magazine swap, or a shotgun's
 * shell-by-shell steps), so one attachment works on both kinds of gun.
 * `flags` are plain facts copied onto the gun for presentation and a few rules
 * (the HUD draws a scope, the suppressor's muffled shot, the laser's dot).
 */
export const ATTACHMENTS = {
  // ---- optics: a clearer picture to aim through, more zoom; bigger ones are slower to raise
  reddot: { slot: 'optic', mods: [['ads.zoom', 'set', 1.45], ['spread.ads', 'mul', 0.9]], flags: { optic: 'reddot' } },
  holo: { slot: 'optic', mods: [['ads.zoom', 'set', 1.6], ['spread.ads', 'mul', 0.85], ['ads.time', 'mul', 1.08]], flags: { optic: 'holo' } },
  scope: {
    slot: 'optic',
    mods: [['ads.zoom', 'set', 2.2], ['spread.ads', 'mul', 0.6], ['ads.time', 'mul', 1.35], ['ads.move', 'mul', 0.9]],
    flags: { optic: 'scope' },
  },
  // ---- muzzle: quieter, or steadier
  suppressor: {
    slot: 'muzzle',
    // Enemies hear it less than half as far, and at night it barely flashes
    // (world/lighting.js): the price is a little range.
    mods: [['noise', 'mul', 0.45], ['damage.nearRange', 'mul', 0.9], ['damage.farRange', 'mul', 0.9]],
    flags: { suppressed: true },
  },
  compensator: {
    slot: 'muzzle',
    mods: [['recoil.pitch', 'mul', 0.75], ['recoil.pattern', 'mul', 0.75], ['noise', 'mul', 1.15]],
    flags: { compensator: true },
  },
  // ---- magazine: more rounds, or a quicker change
  extended: {
    slot: 'mag',
    mods: [['mag', 'mul', 1.5], ['reload', 'mul', 1.15]],
    flags: { extendedMag: true },
  },
  fastmag: { slot: 'mag', mods: [['reload', 'mul', 0.75]], flags: { fastMag: true } },
  // ---- underbarrel: steadier when aimed, or better from the hip
  foregrip: {
    slot: 'under',
    mods: [['recoil.pattern', 'mul', 0.6], ['recoil.yawRandom', 'mul', 0.6], ['spread.ads', 'mul', 0.85]],
    flags: { foregrip: true },
  },
  laser: {
    slot: 'under',
    // Better from the hip, but at night the dot gives you away (world/lighting.js).
    mods: [['spread.hip', 'mul', 0.7], ['spread.move', 'mul', 0.85]],
    flags: { laser: true },
  },
};

/** Which attachments fit which gun. (The DMR's scope is built in; a shotgun has no use for a 2× scope.) */
export const FITS = {
  carbine: ['reddot', 'holo', 'scope', 'suppressor', 'compensator', 'extended', 'fastmag', 'foregrip', 'laser'],
  smg: ['reddot', 'holo', 'scope', 'suppressor', 'compensator', 'extended', 'fastmag', 'foregrip', 'laser'],
  shotgun: ['reddot', 'holo', 'suppressor', 'extended', 'fastmag', 'foregrip', 'laser'],
  dmr: ['suppressor', 'compensator', 'extended', 'fastmag', 'foregrip', 'laser'],
  pistol: ['reddot', 'suppressor', 'compensator', 'extended', 'fastmag', 'laser'],
};

export const SLOTS = ['optic', 'muzzle', 'mag', 'under'];

/** Does attachment `a` fit gun `gun`? */
export const fits = (gun, a) => !!ATTACHMENTS[a] && (FITS[gun] ?? []).includes(a);

/** The reload times a gun has (weapons-data.js): a magazine swap's, or a shotgun's steps. */
export const RELOAD_TIMES = ['tactical', 'empty', 'start', 'perShell', 'end', 'rack'];

function change(target, path, how, value) {
  if (path === 'reload') {
    for (const k of RELOAD_TIMES) if (typeof target.reload[k] === 'number') change(target, `reload.${k}`, how, value);
    return;
  }
  const keys = path.split('.');
  const last = keys.pop();
  let o = target;
  for (const k of keys) o = o[k];
  if (path === 'noise' && o[last] === undefined) o[last] = NOISE.gunshot; // the default every gun has
  const v = o[last];
  if (Array.isArray(v)) o[last] = v.map((x) => (how === 'mul' ? x * value : value));
  else o[last] = how === 'mul' ? v * value : value;
}

/**
 * A gun's row with attachments fitted: a new object (the table is never
 * changed). With no attachments it's the table's own row, so the tuning
 * panel's live sliders still reach it.
 * @param {object} def    a WEAPONS row
 * @param {object} picks  { optic, muzzle, mag, under } attachment ids (missing or unfitting ones are ignored)
 */
export function withAttachments(def, picks = {}) {
  // Each slot's pick, if it's a real attachment for that slot that fits this gun.
  const valid = SLOTS.map((slot) => picks?.[slot]).filter((a, i) => a && ATTACHMENTS[a]?.slot === SLOTS[i] && fits(def.id, a));
  if (!valid.length) return def;
  const out = structuredClone({ ...def, model: undefined });
  out.model = def.model; // the block model's shape is shared, not copied
  out.attachments = {};
  for (const a of valid) {
    const att = ATTACHMENTS[a];
    out.attachments[att.slot] = a;
    for (const [path, how, value] of att.mods) change(out, path, how, value);
    Object.assign(out, att.flags);
  }
  out.mag = Math.max(1, Math.round(out.mag));
  // Reload sounds keep time with a quicker or slower reload. (A shotgun's cues
  // are just names, played as each shell goes in, so they keep time anyway.)
  const k = def.reload.tactical ? out.reload.tactical / def.reload.tactical : 1;
  out.reload.cues = Object.fromEntries(Object.entries(def.reload.cues ?? {})
    .map(([kind, cues]) => [kind, Array.isArray(cues) ? cues.map(([t, s]) => [t * k, s]) : cues]));
  return out;
}

/**
 * A loadout for the arsenal (weapons/arsenal.js): its guns, each with its
 * attachments fitted. Entries are gun ids, or { id, attachments }.
 */
export function loadoutDefs(loadout = LOADOUT) {
  return loadout.map((e) => (typeof e === 'string' ? WEAPONS[e] : withAttachments(WEAPONS[e.id], e.attachments)));
}
