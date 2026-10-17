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

test('the kill house has 10 hostiles, 3 hostages, and start and finish pads', async () => {
  const { expandLevel } = await import('../../src/world/kit.js');
  const e = expandLevel(provingGround);
  const kh = e.targets.filter((t) => t.group === 'killhouse');
  assert.equal(kh.filter((t) => t.kind === 'popup').length, 10);
  assert.equal(kh.filter((t) => t.kind === 'hostage').length, 3);
  assert.deepEqual(e.triggers.map((t) => t.id).sort(), ['killhouse:finish', 'killhouse:start']);
});

test('walls with a door leave a gap you can walk through', async () => {
  await initPhysics();
  const world = createPhysicsWorld();
  buildLevel({ spawn: { pos: [0, 0, 0], yaw: 0 }, pieces: [
    { type: 'box', size: [40, 1, 40], at: [0, -1, 0], mat: 'ground' },
    { type: 'wall', from: [-5, -3], to: [5, -3], openings: [{ at: 5, width: 1.3, bottom: 0, top: 2.2 }] },
  ] }, world);
  const ray = (x, y) => world.castRay(new RAPIER.Ray({ x, y, z: 0 }, { x: 0, y: 0, z: -1 }), 10, true);
  assert.equal(ray(0, 1), null, 'straight through the doorway');
  assert.ok(ray(0, 2.4), 'the wall above the door');
  assert.ok(ray(2, 1), 'the wall beside the door');
});

// ---- the art pass (M6): trims, round things, and solid mission props

/** A tiny level of just these pieces, built; and a ray helper. */
async function tinyLevel(pieces) {
  await initPhysics();
  const world = createPhysicsWorld();
  const level = buildLevel({ name: 'test', spawn: { pos: [0, 0, 20], yaw: 0 }, pieces }, world);
  const ray = (from, dir, len = 20) => world.castRay(new RAPIER.Ray({ x: from[0], y: from[1], z: from[2] }, { x: dir[0], y: dir[1], z: dir[2] }), len, true);
  return { world, level, ray };
}

test('wall trims are only drawn: no colliders, and doorways stay as wide as they look', async () => {
  const door = { at: 3, width: 1.2, bottom: 0, top: 2.2 };
  const window_ = { at: 7, width: 1.2, bottom: 1, top: 2 };
  const { world, level, ray } = await tinyLevel([{ type: 'wall', from: [0, 0], to: [10, 0], height: 3, openings: [door, window_] }]);
  const e = level.expanded;
  assert.ok(e.decor.length >= 8, `a cap, two door jambs and a lintel, two window jambs, a lintel and a sill (${e.decor.length})`);
  assert.equal(world.colliders.len(), e.solids.length, 'one collider per solid, none for the trims');
  // Through the doorway, a hand's width from either jamb: nothing in the way.
  for (const x of [2.45, 3.55]) assert.equal(ray([x, 1, 2], [0, 0, -1]), null, `clear through the door at x = ${x}`);
  // The sill and lintel sit outside the window's opening too.
  for (const y of [1.02, 1.98]) assert.equal(ray([7, y, 2], [0, 0, -1]), null, `clear through the window at y = ${y}`);
  // Sandbags and the map's invisible edge get no trims.
  assert.equal(expandPiece({ type: 'sandbags', from: [0, 0], to: [4, 0] }).decor.length, 0);
  assert.equal(expandPiece({ type: 'boundary', from: [0, 0], to: [4, 0] }).decor.length, 0);
});

test('barrels and fuel tanks are round to bullets too', async () => {
  const { ray, level } = await tinyLevel([
    { type: 'barrel', at: [0, 0, 0] },
    { type: 'tank', at: [10, 0, 0], rotY: -Math.PI / 2 }, // turned to lie north-south
  ]);
  // The barrel: 0.3 m round, 0.9 m tall, wherever you come at it from.
  for (const [dx, dz] of [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2]]) {
    const hit = ray([-dx * 5, 0.5, -dz * 5], [dx, 0, dz]);
    assert.ok(Math.abs(hit.timeOfImpact - 4.7) < 0.01, `barrel side at 0.3 m (${hit.timeOfImpact})`);
  }
  assert.equal(ray([0, 0.95, -5], [0, 0, 1]), null, 'nothing above the barrel');
  // The tank lies north-south: 4 m long, 2 m across, its middle 1.4 m up.
  assert.ok(Math.abs(ray([10, 1.4, -10], [0, 0, 1]).timeOfImpact - 8) < 0.01, 'its end, 2 m from the middle');
  assert.ok(Math.abs(ray([5, 1.4, 0], [1, 0, 0]).timeOfImpact - 4) < 0.01, 'its side, 1 m from the middle');
  assert.ok(Math.abs(ray([10, 5, 0], [0, -1, 0]).timeOfImpact - 2.6) < 0.01, 'its top, 2.4 m up');
  assert.equal(level.expanded.decor.length, 2, 'the barrel\'s hoops');
});

test('lamps are solid only at the pole, and say where their light is', async () => {
  const { level, ray } = await tinyLevel([{ type: 'lamp', at: [0, 0, 0], rotY: Math.PI }]);
  const [lamp] = level.expanded.lamps;
  assert.ok(Math.abs(lamp.at[2] - 0.85) < 1e-9 && lamp.at[1] > 3.5, 'the head hangs over the ground in front (south)');
  assert.ok(ray([0, 1, -3], [0, 0, 1]), 'the pole stops bullets');
  assert.equal(ray([0, 5, 0.85], [0, -1, 0], 4.9), null, 'the arm and head are only drawn');
});

test('every mission site with a prop has it as solid level geometry, the same on every computer', async () => {
  const harbour = (await import('../../levels/harbour.js')).default;
  const { ray, level } = await tinyLevel(harbour.pieces);
  const top = { table: 0.765, stack: 0.9, radio: 0.5 };
  const sites = level.expanded.sites.filter((s) => s.prop);
  assert.ok(sites.length >= 9, `${sites.length} sites with props`);
  for (const s of sites) {
    const y = s.at[1] ?? 0;
    const hit = ray([s.at[0], y + 1.5, s.at[2]], [0, -1, 0], 1.5); // (from under any roof)
    assert.ok(hit && Math.abs(1.5 - hit.timeOfImpact - top[s.prop]) < 0.01, `${s.id}: a ${s.prop}, ${top[s.prop]} m tall`);
  }
  for (const lz of level.expanded.lzs) {
    const hit = ray([lz.radio[0], 3, lz.radio[1]], [0, -1, 0], 3);
    assert.ok(hit && Math.abs(3 - hit.timeOfImpact - 0.5) < 0.01, `${lz.id}: the radio's stand`);
  }
});
