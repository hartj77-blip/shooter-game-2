// Health: how much punishment you can take, and how it comes back.
//
// Recovering health works like a phone charger that only starts once you've put
// the phone down: every hit resets a short wait (regenDelay). Get out of the
// fire, wait, and health refills quickly (regenRate). Stay exposed and it never
// gets the chance. That pushes players towards cover without punishing one
// mistake for the rest of the mission.
//
// Simulation only. The HUD (red screen edges, damage arrows) and sounds react to
// the 'player:hurt' and 'player:down' events this posts.

import { events as gameEvents } from '../core/events.js';

export const DEFAULT_HEALTH = {
  max: 100,
  regenDelay: 4.5,  // seconds after the last hit before health starts coming back
  regenRate: 22,    // points per second once it does (empty to full in about 4.5 s)
  low: 35,          // below this the HUD and sound warn you
};

/**
 * @param {object} [opts]
 * @param {object} [opts.tuning]  defaults to a copy of DEFAULT_HEALTH
 * @param {object} [opts.events]
 * @param {number} [opts.owner]
 */
export function createHealth({ tuning = { ...DEFAULT_HEALTH }, events = gameEvents, owner = 0 } = {}) {
  const state = {
    hp: tuning.max,
    sinceHit: Infinity, // seconds since you were last hurt
    down: false,
    downTime: 0,        // seconds since you went down
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
      events.emit('player:down', { owner, from });
      return { killed: true };
    },

    update(dt) {
      if (state.down) {
        state.downTime += dt;
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
      if (!keepStats) {
        state.taken = 0;
        state.downs = 0;
      }
    },

    get fraction() { return state.hp / tuning.max; },
  };
  return health;
}
