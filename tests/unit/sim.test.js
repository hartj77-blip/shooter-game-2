// The shared simulation (src/game/sim.js): what every mission runs on, solo or co-op.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../../src/world/physics.js';
import { createSim, spawnFor, MAX_PLAYERS } from '../../src/game/sim.js';
import { createHost } from '../../src/net/host.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import compound from '../../levels/compound.js';
import provingGround from '../../levels/proving-ground.js';

/** Play a few seconds of the Compound: walk in through the gate, firing now and then. */
function playthrough(seed) {
  const sim = createSim({ def: compound, id: 'compound', seed });
  const yaw = compound.spawn.yaw;
  for (let i = 0; i < 4 * 60; i++) {
    sim.tick(SIM_DT, { ...idleCommand(yaw), moveZ: 1, fire: i % 40 < 3 });
  }
  const me = sim.player(0);
  const result = {
    me: { ...me.soldier.state.pos },
    hp: me.health.state.hp,
    enemies: sim.enemies.list.map((e) => [e.pos.x, e.pos.z, e.brainState, e.health]),
  };
  return { sim, result };
}

test('a mission can be thrown away and built again, and plays out exactly the same', async () => {
  await initPhysics();
  const first = playthrough(7);
  first.sim.dispose();
  // The physics engine's memory is handed back: the old world can't be used any more.
  assert.throws(() => first.sim.world.step());
  // Nothing from the first run leaked into the second (no shared state left lying around).
  const second = playthrough(7);
  assert.deepEqual(second.result, first.result);
  second.sim.dispose();
});

test('players 2 to 4 start beside the first, all on open ground', async () => {
  await initPhysics();
  const sim = createSim({ def: compound, players: [0, 1, 2, 3].map((owner) => ({ owner })) });
  assert.equal(sim.team.size, MAX_PLAYERS);
  const spots = [...sim.team.values()].map((p) => p.soldier.state.pos);
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) > 1, `players ${i + 1} and ${j + 1} don't overlap`);
    }
  }
  // A second of standing still: nobody falls through the floor or gets stuck in a wall.
  for (let i = 0; i < 60; i++) sim.tick(SIM_DT, new Map());
  for (const p of sim.team.values()) {
    assert.ok(p.soldier.state.grounded, `player ${p.owner + 1} is standing`);
    const [x, , z] = spawnFor(sim.level, p.owner).pos;
    assert.ok(Math.hypot(p.soldier.state.pos.x - x, p.soldier.state.pos.z - z) < 0.05, `player ${p.owner + 1} stayed put`);
  }
  sim.dispose();
});

test('solo play is a host session for one: it pauses, and its step is the simulation tick', async () => {
  await initPhysics();
  const host = createHost({ sim: createSim({ def: provingGround }) });
  assert.equal(host.pausable, true);
  assert.equal(host.teammates.list.length, 0);
  const before = host.local.soldier.state.pos.z;
  for (let i = 0; i < 60; i++) host.step(SIM_DT, { ...idleCommand(host.local.soldier.state.yaw), moveZ: 1 });
  assert.ok(host.local.soldier.state.pos.z < before - 1, 'walked forward (north is -Z)');
  // A friend joining makes it a game that keeps running when you pause.
  host.sim.addPlayer(1);
  assert.equal(host.pausable, false);
  assert.deepEqual(host.teammates.list.map((p) => p.owner), [1]);
  assert.equal(host.teammates.list[0].view.weapon, host.local.soldier.arsenal.current.def.id);
  host.dispose();
});

test("a level's own spawn spots are used (regression: they used to be ignored)", async () => {
  await initPhysics();
  const spawns = [{ pos: [10, 0, 10], yaw: 1 }, { pos: [14, 0, 10], yaw: 2 }];
  const sim = createSim({ def: { ...provingGround, spawns }, players: [{ owner: 0 }, { owner: 1 }] });
  assert.deepEqual(sim.player(1).spawn, spawns[1]);
  assert.ok(Math.abs(sim.player(1).soldier.state.pos.x - 14) < 1e-6);
  sim.dispose();
});
