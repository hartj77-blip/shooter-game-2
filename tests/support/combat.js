// Test helpers for shooting: a small world with a floor, some pieces, targets,
// and a soldier with guns, driven tick by tick like the real game loop.

import { initPhysics, createPhysicsWorld } from '../../src/world/physics.js';
import { buildLevel } from '../../src/world/level.js';
import { createSurfaceRegistry } from '../../src/world/surfaces.js';
import { createTargets } from '../../src/world/targets.js';
import { createSoldier } from '../../src/player/soldier.js';
import { createEvents } from '../../src/core/events.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import { FLOOR } from './sim.js';

/**
 * @param {Array} pieces level pieces (targets included)
 * @param {object} [opts] { spawn, yaw, seed, loadout, options }
 */
export async function makeRange(pieces = [], { spawn = [0, 0, 0], yaw = 0, pitch = 0, seed = 7, loadout, options } = {}) {
  await initPhysics();
  const world = createPhysicsWorld();
  const registry = createSurfaceRegistry();
  const level = buildLevel({ name: 'test', spawn: { pos: spawn, yaw }, pieces: [FLOOR, ...pieces] }, world, registry);
  const targets = createTargets(world, registry, level.expanded.targets);
  world.step(); // file the targets' colliders so rays can find them
  const events = createEvents();
  const log = [];
  for (const name of ['weapon:fire', 'weapon:reload', 'weapon:cue', 'weapon:dry', 'weapon:switch', 'bullet:impact', 'target:hit']) {
    events.on(name, (data) => log.push({ name, ...data }));
  }
  const soldier = createSoldier({ world, spawn: { pos: spawn, yaw }, registry, targets, events, seed, loadout, options });
  const look = { yaw, pitch };

  const range = {
    world, registry, targets, events, log, soldier, look, level,
    get gun() { return soldier.arsenal.current; },
    /** Runs `seconds` of game time. `make(i)` (or a fixed object) gives each tick's command. */
    run(seconds, make = {}) {
      const ticks = Math.round(seconds / SIM_DT);
      let shots = 0;
      for (let i = 0; i < ticks; i++) {
        const partial = typeof make === 'function' ? make(i) : make;
        const cmd = { ...idleCommand(look.yaw, look.pitch), ...partial };
        soldier.move(cmd, SIM_DT);
        targets.update(SIM_DT);
        world.step();
        const out = soldier.act(cmd, SIM_DT);
        look.yaw += out.look.yaw;
        look.pitch += out.look.pitch;
        shots += out.shots.length;
      }
      return { shots };
    },
    /** Let the soldier land and finish raising the first gun. */
    settle() {
      return range.run(0.6);
    },
    count: (name) => log.filter((e) => e.name === name).length,
  };
  return range;
}

/** A command that presses a button on the first tick only (like a click). */
export const click = (button, extra = {}) => (i) => ({ ...extra, [button]: i === 0, ...(button === 'firePressed' ? { fire: i === 0 } : {}) });
