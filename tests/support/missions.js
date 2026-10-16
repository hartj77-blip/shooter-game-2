// Test helper: a small, flat mission map with one of everything missions use
// (sites for every kind of objective, a landing zone, reinforcement entries
// hidden behind walls, a crate and a little garrison), and helpers to walk
// players about by command, the way a real player would.

import { idleCommand } from '../../src/core/input.js';
import { FLOOR } from './sim.js';

export const YARD_PIECES = [
  FLOOR,
  // Reinforcements come in at the north and west edges, behind walls so nobody in the yard sees them arrive.
  { type: 'wall', from: [-8, -33], to: [8, -33], height: 3 },
  { type: 'wall', from: [-33, -8], to: [-33, 8], height: 3 },
  { type: 'entry', id: 'north', at: [0, 0, -37], yaw: Math.PI, route: [[10, -30], [10, -20]] },
  { type: 'entry', id: 'west', at: [-37, 0, 0], yaw: -Math.PI / 2, route: [[-30, 10], [-20, 10]] },
  // Objective sites.
  { type: 'site', id: 'hut', at: [20, 0, -10], yaw: 0, safe: [20, -6, Math.PI] },
  { type: 'site', id: 'shed', at: [24, 0, 4], yaw: 0, safe: [24, 8, Math.PI] },
  { type: 'site', id: 'office', at: [-20, 0, -10], safe: [-20, -6, 0] },
  { type: 'site', id: 'c1', at: [-10, 0, 2], safe: [-10, 6, 0] },
  { type: 'site', id: 'c2', at: [10, 0, 2], safe: [10, 6, 0] },
  { type: 'site', id: 'c3', at: [0, 0, -16], safe: [0, -12, 0] },
  { type: 'site', id: 'tower', at: [0, 0, -4], radius: 6, safe: [0, 0, 0] },
  { type: 'lz', id: 'lz', at: [0, 0, 22], size: 10, radio: [7, 22], approach: Math.PI },
  { type: 'crate', at: [4, 0, 28] },
  // A two-man garrison far off in a corner, looking the other way.
  { type: 'enemy', role: 'rifleman', at: [-30, 0, -28], yaw: Math.PI * 0.75, squad: 'corner' },
  { type: 'enemy', role: 'rifleman', at: [-28, 0, -30], yaw: Math.PI * 0.75, squad: 'corner' },
];

/** The yard with a mission on it. Waves are switched off unless the mission's director says otherwise. */
export function yard(mission, { pieces = YARD_PIECES } = {}) {
  return {
    name: 'Test yard', spawn: { pos: [0, 0, 30], yaw: 0 }, sun: { azimuth: 0, elevation: 1 },
    nav: { min: [-40, -40], max: [40, 40] },
    mission: { director: { calm: 9999 }, ...mission, id: mission.id ?? 'test' },
    pieces,
  };
}

export const RESCUE = {
  id: 'test-rescue', title: 'Test rescue',
  stages: [{ kind: 'rescue', sites: ['hut'] }, { kind: 'extract', lz: 'lz', inbound: 5 }],
};
export const INTEL = {
  id: 'test-intel', title: 'Test intel',
  stages: [{ kind: 'intel', sites: ['office'], download: 4 }, { kind: 'extract', lz: 'lz', inbound: 3 }],
};
export const SABOTAGE = {
  id: 'test-sabotage', title: 'Test sabotage',
  stages: [{ kind: 'sabotage', sites: ['c1', 'c2', 'c3'], caches: 3, fuse: 2 }, { kind: 'extract', lz: 'lz', inbound: 3 }],
};
export const HOLD = {
  id: 'test-hold', title: 'Test hold',
  stages: [{ kind: 'hold', sites: ['tower'], hold: 6 }, { kind: 'extract', lz: 'lz', called: true, inbound: 3 }],
};

const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/**
 * A command that walks player `p` towards `to` (and stops within `near` metres), holding `extra` buttons.
 * @returns {object|null} null once they're there
 */
export function walkCommand(p, to, { near = 0.3, extra = {} } = {}) {
  const pos = p.soldier.state.pos;
  const d = Math.hypot(to.x - pos.x, to.z - pos.z);
  if (d <= near) return null;
  return { ...idleCommand(yawTo(pos, to), 0), moveZ: d > 1.5 ? 1 : 0.4, ...extra };
}

/**
 * Walk players to places, tick by tick, through `fight` (tests/support/ai.js makeFight).
 * @param {object} fight
 * @param {Map<number, {x,z}>|object} goals owner -> where to go (or one goal for player 1)
 * @param {number} [seconds] give up after this long
 */
export function walk(fight, goals, seconds = 30) {
  const map = goals instanceof Map ? goals : new Map([[0, goals]]);
  let ticks = 0;
  const limit = Math.round(seconds * 60);
  for (; ticks < limit; ticks++) {
    let moving = false;
    const make = (i, owner) => {
      const p = fight.sim.player(owner);
      const goal = map.get(owner);
      const cmd = goal ? walkCommand(p, goal) : null;
      if (cmd) moving = true;
      return cmd ?? { ...idleCommand(p.soldier.state.yaw, 0) };
    };
    fight.run(1 / 60, make, null, make);
    if (!moving) break;
  }
  return ticks / 60;
}

/** Hold F (and stand still) for `seconds`, everyone or just `owners`. */
export function holdF(fight, seconds, owners = null) {
  const make = (i, owner) => {
    const p = fight.sim.player(owner);
    return { ...idleCommand(p.soldier.state.yaw, 0), interact: !owners || owners.includes(owner) };
  };
  fight.run(seconds, make, null, make);
}

export const at = (site) => ({ x: site[0], y: 0, z: site[2] ?? site[1] });
