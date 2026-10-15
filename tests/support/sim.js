// Test helpers: build a small physics world and drive a player through it
// with scripted commands, with no browser and no graphics.

import { initPhysics, createPhysicsWorld } from '../../src/world/physics.js';
import { buildLevel } from '../../src/world/level.js';
import { createPlayer } from '../../src/player/controller.js';
import { createEvents } from '../../src/core/events.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';

export const FLOOR = { type: 'box', size: [200, 1, 200], at: [0, -1, 0], mat: 'ground' };

/** A world containing `pieces` (plus a floor) and a player standing at `spawn`. */
export async function makeSim(pieces = [], { spawn = [0, 0, 0], yaw = 0, tuning } = {}) {
  await initPhysics();
  const world = createPhysicsWorld();
  buildLevel({ name: 'test', spawn: { pos: spawn, yaw }, pieces: [FLOOR, ...pieces] }, world);
  const events = createEvents();
  const log = [];
  for (const name of ['player:jump', 'player:land', 'player:slide', 'player:mantle']) {
    events.on(name, (data) => log.push({ name, ...data }));
  }
  const player = createPlayer({ world, spawn: { pos: spawn, yaw }, events, ...(tuning ? { tuning } : {}) });

  const sim = {
    world, player, events, log,
    state: player.state,
    /** Run for `seconds`, calling make(tick) for each tick's command (or using a fixed command object). */
    run(seconds, make = {}) {
      const ticks = Math.round(seconds / SIM_DT);
      let peakY = -Infinity;
      for (let i = 0; i < ticks; i++) {
        const partial = typeof make === 'function' ? make(i) : make;
        player.update({ ...idleCommand(player.state.yaw), ...partial }, SIM_DT);
        world.step();
        peakY = Math.max(peakY, player.state.pos.y);
      }
      return { peakY };
    },
    /** Let the player settle onto the floor. */
    settle() {
      return sim.run(0.3);
    },
  };
  return sim;
}

/** A command that only presses a button on the first tick, like a tap. */
export const tap = (button, extra = {}) => (i) => ({ ...extra, [button]: i === 0 });
