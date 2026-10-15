// Test helper for enemy AI: a small level, you (a soldier with health), some
// enemies, and the full tick in the same order as main.js. No browser needed.

import { initPhysics, createPhysicsWorld } from '../../src/world/physics.js';
import { buildLevel } from '../../src/world/level.js';
import { createSurfaceRegistry } from '../../src/world/surfaces.js';
import { createSoldier } from '../../src/player/soldier.js';
import { createHealth } from '../../src/player/health.js';
import { buildNavGrid } from '../../src/ai/nav-grid.js';
import { buildCover } from '../../src/ai/cover.js';
import { createNoiseBoard } from '../../src/ai/noise.js';
import { createEnemies } from '../../src/ai/enemies.js';
import { createEvents } from '../../src/core/events.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import { FLOOR } from './sim.js';

/**
 * @param {object} o
 * @param {Array} [o.pieces]   level pieces (enemy pieces included)
 * @param {number[]} [o.spawn] where you stand
 * @param {number} [o.yaw]
 * @param {number} [o.seed]
 * @param {string} [o.difficulty]
 * @param {object} [o.bounds]  nav grid area
 * @param {boolean} [o.god]    you can't be hurt
 * @param {object} [o.level]   a whole level definition (levels/*.js) instead of pieces
 */
export async function makeFight({ pieces = [], spawn = [0, 0, 0], yaw = 0, seed = 11, difficulty = 'regular', bounds = { min: [-40, -40], max: [40, 40] }, god = false, level: def = null } = {}) {
  await initPhysics();
  const world = createPhysicsWorld();
  const registry = createSurfaceRegistry();
  if (def) {
    spawn = def.spawn.pos;
    yaw = def.spawn.yaw;
    bounds = def.nav;
  }
  const level = buildLevel(def ?? { name: 'test', spawn: { pos: spawn, yaw }, pieces: [FLOOR, ...pieces] }, world, registry);
  const nav = buildNavGrid(world, bounds);
  const cover = buildCover(world, nav);
  const noise = createNoiseBoard();
  const events = createEvents();
  const log = [];
  for (const name of ['weapon:fire', 'player:hurt', 'player:down', 'enemy:down', 'enemy:bark', 'bullet:nearmiss', 'target:hit']) {
    events.on(name, (data) => log.push({ name, time: fight.time, ...data }));
  }
  const health = createHealth({ events });
  health.godMode = god;
  let enemies = null;
  const soldier = createSoldier({
    world, registry, events, seed, noise, flatZones: true,
    spawn: { pos: spawn, yaw },
    damage: (victim, amount, hit) => (victim.kind === 'enemy' ? enemies.damage(victim, amount, hit) : { killed: false }),
  });
  enemies = createEnemies({ world, registry, nav, cover, noise, events, seed, difficulty, specs: level.expanded.enemies, player: { soldier, health } });
  world.step();
  const look = { yaw, pitch: 0 };

  const fight = {
    world, registry, nav, cover, noise, events, log, soldier, health, enemies, look, level,
    time: 0,
    get list() { return enemies.list; },
    e: (i = 0) => enemies.list[i],
    /** Run `seconds` of game time. `make(i)` (or a fixed object) is your command; `each(i)` runs after every tick. */
    run(seconds, make = {}, each = null) {
      const ticks = Math.round(seconds / SIM_DT);
      for (let i = 0; i < ticks; i++) {
        const partial = typeof make === 'function' ? make(i) : make;
        const cmd = { ...idleCommand(look.yaw, look.pitch), ...partial };
        soldier.move(cmd, SIM_DT);
        enemies.move(SIM_DT);
        world.step();
        const out = soldier.act(cmd, SIM_DT);
        look.yaw += out.look.yaw;
        look.pitch += out.look.pitch;
        enemies.playerShots(out.shots);
        enemies.think(SIM_DT);
        enemies.act(SIM_DT);
        health.update(SIM_DT);
        fight.time += SIM_DT;
        each?.(i);
      }
    },
    count: (name, filter = () => true) => log.filter((e) => e.name === name && filter(e)).length,
    /** Put yourself somewhere instantly. */
    teleport(pos, y = look.yaw) {
      soldier.teleport(pos, y);
      look.yaw = y;
      world.step();
    },
  };
  return fight;
}

/** An enemy level piece. */
export const enemy = (role, at, extra = {}) => ({ type: 'enemy', role, at, ...extra });
