// Navigation grid, A* and cover tests (docs/lessons/09-pathfinding-and-cover.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, createPhysicsWorld, RAPIER } from '../../src/world/physics.js';
import { buildLevel } from '../../src/world/level.js';
import { buildNavGrid } from '../../src/ai/nav-grid.js';
import { findPath, smoothPath, route } from '../../src/ai/astar.js';
import { buildCover } from '../../src/ai/cover.js';
import { SIGHT } from '../../src/world/groups.js';
import { FLOOR } from '../support/sim.js';

async function mapOf(pieces, bounds = { min: [-15, -15], max: [15, 15] }) {
  await initPhysics();
  const world = createPhysicsWorld();
  buildLevel({ name: 'test', spawn: { pos: [0, 0, 0], yaw: 0 }, pieces: [FLOOR, ...pieces] }, world);
  return { world, nav: buildNavGrid(world, bounds) };
}

const at = (x, z, y = 0) => ({ x, y, z });

test('open ground is all walkable, and a route across it is one straight line', async () => {
  const { nav } = await mapOf([]);
  assert.equal(nav.count, nav.nx * nav.nz);
  const r = route(nav, at(-12, -12), at(12, 12));
  assert.equal(r.length, 2, 'start and end only');
});

test('cells keep their distance from walls', async () => {
  const { nav } = await mapOf([{ type: 'box', size: [0.3, 3, 10], at: [0, 0, 0] }]);
  // The wall's faces are at x = ±0.15; nothing may be closer than the nav radius (0.3).
  for (let c = 0; c < nav.count; c++) {
    if (Math.abs(nav.Z[c]) < 4.6 && nav.Y[c] < 0.1) assert.ok(Math.abs(nav.X[c]) >= 0.15 + 0.3 - 1e-3, `cell at x ${nav.X[c]}`);
  }
});

test('a route goes round a wall, through the gap, never through the wall', async () => {
  const { world, nav } = await mapOf([
    { type: 'wall', from: [-15, 0], to: [15, 0], height: 3, openings: [{ at: 26, width: 1.2 }] },
  ]);
  const r = route(nav, at(-5, 5), at(-5, -5));
  assert.ok(r, 'found a way');
  assert.ok(r.some((p) => p.x > 9), 'it uses the door near the east end');
  // Every straight leg of the route is clear at knee height.
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i];
    const d = { x: b.x - a.x, y: 0, z: b.z - a.z };
    const len = Math.hypot(d.x, d.z);
    const hit = world.castRay(new RAPIER.Ray({ x: a.x, y: a.y + 0.5, z: a.z }, { x: d.x / len, y: 0, z: d.z / len }), len, true, undefined, SIGHT);
    assert.equal(hit, null, `leg ${i} is clear`);
  }
});

test('a 1.2 m doorway is always passable', async () => {
  for (const shift of [0, 0.1, 0.2, 0.3]) {
    const { nav } = await mapOf([
      { type: 'wall', from: [-15, shift], to: [15, shift], height: 3, openings: [{ at: 15 + shift, width: 1.2 }] },
    ]);
    assert.ok(route(nav, at(0, 5), at(0, -5)), `door shifted ${shift} m`);
  }
});

test('stairs link the ground to a platform; a waist-high wall does not', async () => {
  const { nav } = await mapOf([
    // 8 steps of 0.25 m up to a 2 m platform to the north.
    { type: 'stairs', at: [0, 0, 0], width: 1.6, rise: 0.25, steps: 8, run: 0.35 },
    { type: 'box', size: [4, 2, 4], at: [0, 0, -4.8] },
    { type: 'box', size: [3, 0.75, 1.2], at: [8, 0, 0] },
  ]);
  const top = nav.nearest(at(0, -4.8, 2));
  assert.ok(top >= 0 && Math.abs(nav.Y[top] - 2) < 0.01, 'the platform top is mapped');
  assert.equal(nav.component[top], nav.main, 'and reachable');
  const r = route(nav, at(0, 6), at(0, -4.8, 2));
  assert.ok(r && Math.abs(r.at(-1).y - 2) < 0.01, 'a route climbs the stairs');
  const wallTop = nav.nearest(at(8, 0, 0.75), { anyIsland: true });
  assert.ok(wallTop >= 0 && nav.component[wallTop] !== nav.main, 'the low wall top is its own island');
});

test('two floors in one column: the ground floor under a balcony and the balcony itself', async () => {
  const { nav } = await mapOf([
    { type: 'box', size: [6, 0.3, 6], at: [0, 2.6, -6] },        // an upstairs floor on stilts
    { type: 'box', size: [0.3, 2.6, 0.3], at: [-2.8, 0, -8.8] },
    { type: 'stairs', at: [0, 0, 4], width: 1.6, rise: 0.25, steps: 12, run: 0.3, rotY: 0 },
    { type: 'box', size: [1.6, 2.9, 3], at: [0, 0, -1.6] },      // a solid landing up to the floor
  ]);
  const column = nav.cellsAt(0, -7);
  assert.equal(column.length, 2, 'ground and upstairs');
  assert.ok(Math.abs(nav.Y[column[0]] - 2.9) < 0.01);
  assert.ok(Math.abs(nav.Y[column[1]] - 0) < 0.01);
});

test('a sealed room has no route in', async () => {
  const room = [
    { type: 'wall', from: [-3, -3], to: [3, -3], height: 3 },
    { type: 'wall', from: [3, -3], to: [3, 3], height: 3 },
    { type: 'wall', from: [3, 3], to: [-3, 3], height: 3 },
    { type: 'wall', from: [-3, 3], to: [-3, -3], height: 3 },
  ];
  const { nav } = await mapOf(room);
  const inside = nav.nearest(at(0, 0), { anyIsland: true });
  const outside = nav.nearest(at(10, 10));
  assert.equal(findPath(nav, outside, inside), null);
});

test('smoothing turns a staircase of squares into a few corners', async () => {
  const { nav } = await mapOf([{ type: 'box', size: [8, 3, 8], at: [0, 0, 0] }]);
  const found = findPath(nav, nav.nearest(at(-8, -8)), nav.nearest(at(8, 8)));
  const smooth = smoothPath(nav, found.cells);
  assert.ok(found.cells.length > 30);
  assert.ok(smooth.length <= 4, `${smooth.length} waypoints`);
});

// ---------------------------------------------------------------- cover

test('cover points line the walls: low behind a crate, high behind a container-sized block', async () => {
  const { world, nav } = await mapOf([
    { type: 'box', size: [3, 1, 0.6], at: [-5, 0, 0] },     // waist-high
    { type: 'box', size: [2.4, 2.6, 6], at: [5, 0, 0] },    // taller than you
  ]);
  const cover = buildCover(world, nav);
  const near = (x) => cover.points.filter((p) => Math.abs(p.pos.x - x) < 3 && Math.abs(p.pos.z) < 4);
  assert.ok(near(-5).length > 0 && near(-5).every((p) => !p.high), 'low cover by the crate');
  assert.ok(near(5).some((p) => p.high), 'high cover by the block');
  assert.ok(near(5).filter((p) => p.high).some((p) => p.peeks.length > 0), 'with somewhere to lean out and shoot');
});

test('cover that hides you from the front is useless once you are flanked', async () => {
  const { world, nav } = await mapOf([{ type: 'box', size: [3, 1, 0.6], at: [0, 0, 0] }]);
  const cover = buildCover(world, nav);
  // A spot just south of the crate, protected towards the north.
  const p = cover.points.find((q) => q.dir.z === -1 && Math.abs(q.pos.x) < 0.5);
  assert.ok(p, 'a spot behind the crate');
  const front = cover.evaluate(p, { x: 0, y: 1.6, z: -15 });
  assert.equal(front.safe, true, 'safe from the north');
  assert.equal(front.canShoot, true, 'and you can pop up to shoot');
  assert.equal(cover.evaluate(p, { x: 12, y: 1.6, z: 2 }).safe, false, 'not from the side');
});
