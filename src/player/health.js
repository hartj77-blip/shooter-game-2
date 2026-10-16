// Health: how much punishment you can take, and how it comes back.
//
// Recovering health works like a phone charger that only starts once you've put
// the phone down: every hit resets a short wait (regenDelay). Get out of the
// fire, wait, and health refills quickly (regenRate). Stay exposed and it never
// gets the chance. That pushes players towards cover without punishing one
// mistake for the rest of the mission.
//
// GOING DOWN. Solo, reaching zero is the end of the fight (press R to try again).
// In co-op you're "revivable": you go down and start BLEEDING OUT, a 30-second
// countdown like a match burning down. A teammate can get you back up before it
// burns out (game/revive.js); if it does burn out you're dead until the next
// fight, and you watch your teammates instead.
//
// Simulation only. The HUD (red screen edges, damage arrows) and sounds react to
// the 'player:hurt', 'player:down', 'player:dead' and 'player:revive' events this posts.

import { events as gameEvents } from '../core/events.js';

export const DEFAULT_HEALTH = {
  max: 100,
  regenDelay: 4.5,  // seconds after the last hit before health starts coming back
  regenRate: 22,    // points per second once it does (empty to full in about 4.5 s)
  low: 35,          // below this the HUD and sound warn you
  bleedOut: 30,     // co-op: seconds a downed player can wait for help
  reviveHealth: 30, // co-op: health you get back up with
};

/**
 * @param {object} [opts]
 * @param {object} [opts.tuning]  defaults to a copy of DEFAULT_HEALTH
 * @param {object} [opts.events]
 * @param {number} [opts.owner]
 * @param {boolean} [opts.revivable] co-op: going down starts a bleed-out a teammate can stop
 */
export function createHealth({ tuning = { ...DEFAULT_HEALTH }, events = gameEvents, owner = 0, revivable = false } = {}) {
  const state = {
    hp: tuning.max,
    sinceHit: Infinity, // seconds since you were last hurt
    down: false,
    downTime: 0,        // seconds since you went down
    bleeding: false,    // co-op: down, and a teammate can still revive you
    bleedLeft: 0,       // co-op: seconds until you bleed out
    dead: false,        // co-op: bled out; back for the next fight
    taken: 0,           // total damage taken (for the results card)
    downs: 0,           // times you went down
  };
  const health = {
    state,
    tuning,
    godMode: false,

    /**
     * You've been hit.
     * @param {number} amount
     * @param {{x,y,z}} [from] where the shot came from (for the HUD's damage arrow)
     * @returns {{killed:boolean}}
     */
    damage(amount, from = null) {
      if (state.down || amount <= 0) return { killed: false };
      const dealt = health.godMode ? 0 : Math.min(amount, state.hp);
      state.hp -= dealt;
      state.taken += dealt;
      state.sinceHit = 0;
      events.emit('player:hurt', { owner, amount: dealt, raw: amount, health: state.hp, max: tuning.max, from });
      if (state.hp > 0) return { killed: false };
      state.hp = 0;
      state.down = true;
      state.downTime = 0;
      state.downs++;
      if (revivable) {
        state.bleeding = true;
        state.bleedLeft = tuning.bleedOut;
      }
      events.emit('player:down', { owner, from, revivable });
      return { killed: true };
    },

    /** A teammate got you back up (game/revive.js). `by` is who did it. */
    revive(by = null) {
      if (!state.bleeding) return false;
      state.down = false;
      state.bleeding = false;
      state.bleedLeft = 0;
      state.hp = tuning.reviveHealth;
      state.sinceHit = 0; // the usual wait before health starts coming back
      events.emit('player:revive', { owner, by });
      return true;
    },

    update(dt) {
      if (state.down) {
        state.downTime += dt;
        if (state.bleeding) {
          state.bleedLeft -= dt;
          if (state.bleedLeft <= 0) {
            state.bleeding = false;
            state.bleedLeft = 0;
            state.dead = true;
            events.emit('player:dead', { owner });
          }
        }
        return;
      }
      state.sinceHit += dt;
      if (state.sinceHit >= tuning.regenDelay && state.hp < tuning.max) {
        state.hp = Math.min(tuning.max, state.hp + tuning.regenRate * dt);
      }
    },

    /** Back to full health (respawning, restarting). `keepStats` keeps the totals for the results card. */
    reset(keepStats = false) {
      state.hp = tuning.max;
      state.sinceHit = Infinity;
      state.down = false;
      state.downTime = 0;
      state.bleeding = false;
      state.bleedLeft = 0;
      state.dead = false;
      if (!keepStats) {
        state.taken = 0;
        state.downs = 0;
      }
    },

    get fraction() { return state.hp / tuning.max; },
  };
  return health;
}
