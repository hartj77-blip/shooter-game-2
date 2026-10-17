// Test helper for enemy AI: a small level (or a whole one), 1 to 4 players and
// some enemies, run with the game's own simulation (src/game/sim.js), so the
// tick order is exactly the game's. No browser needed.

import { initPhysics } from '../../src/world/physics.js';
import { createSim } from '../../src/game/sim.js';
import { createEvents } from '../../src/core/events.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import { FLOOR } from './sim.js';

/**
 * @param {object} o
 * @param {Array} [o.pieces]   level pieces (enemy pieces included)
 * @param {number[]} [o.spawn] where player 1 stands
 * @param {number} [o.yaw]
 * @param {number} [o.seed]
 * @param {string} [o.difficulty]
 * @param {object} [o.bounds]  nav grid area
 * @param {boolean} [o.god]    players can't be hurt
 * @param {object} [o.level]   a whole level definition (levels/*.js) instead of pieces
 * @param {number} [o.players] how many players (they start round the spawn)
 * @param {boolean} [o.night]  a night level (world/lighting.js): darkness hides you
 */
export async function makeFight({ pieces = [], spawn = [0, 0, 0], yaw = 0, seed = 11, difficulty = 'regular', bounds = { min: [-40, -40], max: [40, 40] }, god = false, level: def = null, players = 1, night = false } = {}) {
  await initPhysics();
  const events = createEvents();
  const log = [];
  for (const name of ['weapon:fire', 'player:hurt', 'player:down', 'enemy:down', 'enemy:bark', 'bullet:nearmiss', 'target:hit']) {
    events.on(name, (data) => log.push({ name, time: fight.time, ...data }));
  }
  const levelDef = def ?? { name: 'test', spawn: { pos: spawn, yaw }, nav: bounds, night, pieces: [FLOOR, ...pieces] };
  const sim = createSim({ def: levelDef, id: 'test', seed, difficulty, events, players: Array.from({ length: players }, (_, owner) => ({ owner })) });
  for (const p of sim.team.values()) p.health.godMode = god;
  const looks = new Map([...sim.team.values()].map((p) => [p.owner, { yaw: p.spawn.yaw, pitch: 0 }]));
  const me = sim.player(0);

  const fight = {
    sim, world: sim.world, registry: sim.registry, nav: sim.nav, cover: sim.cover, noise: sim.noise,
    events, log, level: sim.level,
    soldier: me.soldier, health: me.health, enemies: sim.enemies,
    look: looks.get(0),
    get players() { return [...sim.team.values()]; },
    time: 0,
    get list() { return sim.enemies.list; },
    e: (i = 0) => sim.enemies.list[i],
    /**
     * Run `seconds` of game time. `make(i, owner)` (or a fixed object) is each player's command
     * (player 1's, if `others` is given); `others(i, owner)` gives the rest theirs; `each(i)` runs after every tick.
     */
    run(seconds, make = {}, each = null, others = null) {
      const ticks = Math.round(seconds / SIM_DT);
      for (let i = 0; i < ticks; i++) {
        const cmds = new Map();
        for (const p of sim.team.values()) {
          const look = looks.get(p.owner);
          const source = p.owner === 0 || !others ? make : others;
          const partial = typeof source === 'function' ? source(i, p.owner) : (p.owner === 0 ? source : {});
          cmds.set(p.owner, { ...idleCommand(look.yaw, look.pitch), ...partial });
        }
        const outs = sim.tick(SIM_DT, cmds);
        for (const [owner, out] of outs) {
          const look = looks.get(owner);
          look.yaw += out.look.yaw;
          look.pitch += out.look.pitch;
        }
        fight.time += SIM_DT;
        each?.(i);
      }
    },
    count: (name, filter = () => true) => log.filter((e) => e.name === name && filter(e)).length,
    /** Put a player (default: you) somewhere instantly. */
    teleport(pos, y = looks.get(0).yaw, owner = 0) {
      sim.player(owner).soldier.teleport(pos, y);
      looks.get(owner).yaw = y;
      sim.world.step();
    },
  };
  return fight;
}

/** An enemy level piece. */
export const enemy = (role, at, extra = {}) => ({ type: 'enemy', role, at, ...extra });
