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

export const gunName = (id) => WEAPONS[id]?.name ?? id;

/** "SMG", "Recon drone", "Red dot sight for the K4 Carbine". */
export function unlockName(item, gun = null) {
  if (ATTACHMENT_NAMES[item]) return gun ? `${ATTACHMENT_NAMES[item]} for the ${gunName(gun)}` : ATTACHMENT_NAMES[item];
  if (CALLIN_NAMES[item]) return CALLIN_NAMES[item];
  return gunName(item);
}
