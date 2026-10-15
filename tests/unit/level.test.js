// Level tests: the Proving Ground builds, and every test station is where its sign says.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, createPhysicsWorld, RAPIER } from '../../src/world/physics.js';
import { buildLevel } from '../../src/world/level.js';
import { expandPiece, placePoint } from '../../src/world/kit.js';
import { createPlayer } from '../../src/player/controller.js';
import { createEvents } from '../../src/core/events.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import provingGround from '../../levels/proving-ground.js';

test('placePoint turns pieces the same way three.js and Rapier do', () => {
  // A quarter turn (rotY = -90°) should make "north" (-Z) point east (+X).
  const [x, , z] = placePoint([0, 0, -1], [0, 0, 0], -Math.PI / 2);
  assert.ok(Math.abs(x - 1) < 1e-9 && Math.abs(z) < 1e-9, `got ${x}, ${z}`);
});

test('stairs expand into one solid column per step', () => {
  const { solids } = expandPiece({ type: 'stairs', at: [0, 0, 0], width: 2, rise: 0.25, steps: 4, run: 0.3 });
  assert.equal(solids.length, 4);
  assert.deepEqual(solids.map((s) => s.size[1]), [0.25, 0.5, 0.75, 1]);
});

test('the Proving Ground builds, and the player can stand at the spawn point', async () => {
  await initPhysics();
  const world = createPhysicsWorld();
  const level = buildLevel(provingGround, world);
  assert.ok(level.expanded.solids.length > 50, 'has plenty of pieces');
  assert.ok(level.expanded.signs.length > 10, 'has signs');

  const player = createPlayer({ world, spawn: level.spawn, events: createEvents() });
  for (let i = 0; i < 30; i++) {
    player.update(idleCommand(level.spawn.yaw), SIM_DT);
    world.step();
  }
  assert.equal(player.state.mode, 'ground');
  assert.ok(Math.abs(player.state.pos.y) < 0.05, 'standing on the ground at spawn');
});

test('the mantle wall heights match their labels', async () => {
  await initPhysics();
  const world = createPhysicsWorld();
  buildLevel(provingGround, world);
  for (const [z, h] of [[-10, 0.75], [-6, 1.25], [-2, 1.75], [2, 2.25], [6, 2.75]]) {
    const hit = world.castRay(new RAPIER.Ray({ x: -17, y: 10, z }, { x: 0, y: -1, z: 0 }), 20, true);
    assert.ok(Math.abs(10 - hit.timeOfImpact - h) < 1e-3, `block at z=${z} should be ${h} m`);
  }
});
