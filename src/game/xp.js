// XP: what you earn in a fight, counted from the events the game already sends.
//
// Every browser counts only its own player's XP (`me`): kills and hits carry
// an `owner`, revives a `by`, and the mission's events reach everyone. So
// nothing new crosses the network, and the host never needs to know anyone's
// progress (like everyone keeping their own score card in a pub quiz).
//
// The XP goes straight into the profile (game/profile.js) as it's earned, so
// leaving a mission early still keeps what you earned. The tracker also keeps
// this fight's breakdown for the debrief.
//
// No DOM, no three.js: this runs in Node.

import { modifierXp } from './modifiers.js';

export const XP = {
  kill: 100,          // an enemy down (and the same for the gun that did it)
  headshot: 50,       // ...on top, if it was a headshot
  revive: 150,        // getting a teammate back up
  stage: 400,         // each step of a mission done (everyone)
  mission: 1000,      // extracted (everyone)
  compound: 800,      // the Compound cleared (everyone)
  damagePerGunXp: 10, // a gun earns 1 XP per this much damage it does
  night: 1.25,        // night missions: everything counts this much more
  difficulty: { recruit: 0.75, regular: 1, veteran: 1.5 },
};

const REASONS = {
  kill: 'Enemies down', headshot: 'Headshots', revive: 'Revives',
  stage: 'Objectives', mission: 'Mission complete', compound: 'Compound cleared',
};

/**
 * @param {object} opts
 * @param {object} opts.events     the mission's event bus
 * @param {number} opts.me         your player slot
 * @param {object} opts.profile    game/profile.js createProfile()
 * @param {string} [opts.difficulty]
 * @param {boolean} [opts.night]
 * @param {(change) => void} [opts.onChange]  after each award: { xp, reason, rankUp, unlocks }
 */
export function createXpTracker({ events, me, profile, difficulty = 'regular', night = false, modifiers = [], onChange = () => {} }) {
  // (Mission modifiers add their bonus too: game/modifiers.js.)
  const mult = (XP.difficulty[difficulty] ?? 1) * (night ? XP.night : 1) * modifierXp(modifiers);
  const lines = new Map(); // reason -> xp this fight
  const guns = new Map();  // gun -> xp this fight
  let total = 0;
  const damage = new Map(); // gun -> damage not yet turned into gun XP

  function award(reason, base, gun = null) {
    const xp = Math.round(base * mult);
    total += xp;
    lines.set(reason, (lines.get(reason) ?? 0) + xp);
    if (gun) guns.set(gun, (guns.get(gun) ?? 0) + xp);
    const change = profile.award(xp, gun);
    onChange({ xp, reason, ...change });
  }

  const offs = [
    events.on('enemy:down', (e) => {
      if (e.owner !== me) return;
      const gun = typeof e.weapon === 'string' ? e.weapon : null;
      award('kill', XP.kill, gun);
      if (e.headshot) award('headshot', XP.headshot, gun);
      profile.count('kills');
      if (e.headshot) profile.count('headshots');
    }),
    // Damage with a gun (against enemies) slowly levels that gun up too.
    events.on('target:hit', (e) => {
      if (e.owner !== me || e.kind !== 'enemy' || typeof e.weapon !== 'string' || !(e.damage > 0)) return;
      const d = (damage.get(e.weapon) ?? 0) + e.damage;
      const xp = Math.floor(d / XP.damagePerGunXp);
      damage.set(e.weapon, d - xp * XP.damagePerGunXp);
      if (xp > 0) {
        guns.set(e.weapon, (guns.get(e.weapon) ?? 0) + xp);
        const change = profile.awardGun(e.weapon, xp);
        if (change.unlocks.length) onChange({ xp: 0, reason: null, rankUp: null, unlocks: change.unlocks });
      }
    }),
    events.on('player:revive', (e) => {
      if (e.by !== me) return;
      award('revive', XP.revive);
      profile.count('revives');
    }),
    events.on('objective:complete', (e) => {
      if (e.kind !== 'extract') award('stage', XP.stage);
    }),
    events.on('mission:complete', () => {
      award('mission', XP.mission);
      profile.count('missions');
    }),
    events.on('encounter:finish', () => {
      award('compound', XP.compound);
      profile.count('missions');
    }),
  ];

  return {
    /** This fight so far: { total, lines: [{ reason, label, xp }], guns: [{ gun, xp }], multiplier }. */
    get summary() {
      return {
        total,
        multiplier: mult,
        lines: [...lines].map(([reason, xp]) => ({ reason, label: REASONS[reason] ?? reason, xp })),
        guns: [...guns].map(([gun, xp]) => ({ gun, xp })),
      };
    },
    dispose() { for (const off of offs) off(); },
  };
}
