// What to call things on screen: guns, attachments, call-ins. One place, so the
// loadout screen, the debrief and the "New: ..." toasts all agree.

import { WEAPONS } from '../weapons/weapons-data.js';

export const ATTACHMENT_NAMES = {
  reddot: 'Red dot sight', holo: 'Holographic sight', scope: '2× scope',
  suppressor: 'Suppressor', compensator: 'Compensator',
  extended: 'Extended magazine', fastmag: 'Fast magazine',
  foregrip: 'Foregrip', laser: 'Laser',
};

export const CALLIN_NAMES = {
  supply: 'Supply drop', recon: 'Recon drone', smoke: 'Smoke screen', mortar: 'Mortar strike',
};

export const CALLIN_INFO = {
  supply: 'A crate of ammo by parachute, where you point.',
  recon: 'A drone marks every enemy near where you point, for the whole squad.',
  smoke: 'A wall of smoke nobody can see through. Bullets still go through it.',
  mortar: 'Shells land where you point, after a red smoke warning.',
};

export const gunName = (id) => WEAPONS[id]?.name ?? id;

/** "SMG", "Recon drone", "Red dot sight for the K4 Carbine". */
export function unlockName(item, gun = null) {
  if (ATTACHMENT_NAMES[item]) return gun ? `${ATTACHMENT_NAMES[item]} for the ${gunName(gun)}` : ATTACHMENT_NAMES[item];
  if (CALLIN_NAMES[item]) return CALLIN_NAMES[item];
  return gunName(item);
}

// What each number an attachment changes means to a player (weapons/attachments.js `mods`).
const MOD_WORDS = {
  'ads.zoom': 'zoom',
  'ads.time': 'time to aim',
  'ads.move': 'speed while aiming',
  'spread.ads': 'spread when aimed',
  'spread.hip': 'spread from the hip',
  'spread.move': 'spread on the move',
  noise: 'heard from',
  'damage.nearRange': 'full-damage range',
  'damage.farRange': null, // (said once, with the near range)
  'recoil.pitch': 'kick',
  'recoil.pattern': 'sideways kick',
  'recoil.yawRandom': 'shake',
  mag: 'rounds',
  reload: 'reload time',
};
const FLAG_WORDS = {
  suppressed: 'no muzzle flash',
  laser: 'shows at night',
};

/**
 * An attachment's effect in words, from its own data, so it can never
 * disagree with what it really does: ["zoom 2.2×", "spread when aimed −40%", ...].
 */
export function describeAttachment(att) {
  const out = [];
  for (const [path, how, value] of att.mods) {
    const word = MOD_WORDS[path];
    if (!word) continue;
    if (how === 'set') out.push(`${word} ${value}×`);
    else out.push(`${word} ${value > 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`);
  }
  for (const [flag, word] of Object.entries(FLAG_WORDS)) if (att.flags?.[flag]) out.push(word);
  return out;
}
export { MOD_WORDS };
