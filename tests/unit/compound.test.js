// The Compound: the level, fairness at the start, and the "clear it" rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFight } from '../support/ai.js';
import { findPath } from '../../src/ai/astar.js';
import { RAPIER } from '../../src/world/physics.js';
import { SIGHT } from '../../src/world/groups.js';
import { createEncounter } from '../../src/game/encounter.js';
import { createRecords } from '../../src/game/course.js';
import compound from '../../levels/compound.js';

let shared = null;
const fight = async () => (shared ??= await makeFight({ level: compound, god: true }));

test('16 enemies in 6 squads, all three roles', async () => {
  const f = await fight();
  assert.equal(f.list.length, 16);
  assert.equal(f.enemies.squads.size, 6);
  assert.deepEqual(new Set(f.list.map((e) => e.role)), new Set(['rifleman', 'rusher', 'marksman']));
});

test('every enemy start and patrol point can be reached from your spawn', async () => {
  const f = await fight();
  const from = f.nav.nearest({ x: compound.spawn.pos[0], y: 0, z: compound.spawn.pos[2] });
  assert.ok(from >= 0);
  for (const e of f.list) {
    for (const p of [e.spawn.pos, ...e.patrol]) {
      const c = f.nav.nearest(p, { radius: 1 });
      assert.ok(c >= 0, `${e.id} (${e.role}) has a walkable spot at ${p.x}, ${p.z}`);
      assert.ok(findPath(f.nav, from, c), `${e.id} (${e.role}) at ${p.x}, ${p.z} is reachable`);
    }
  }
});

test('upstairs, the balcony and the tower top are reachable by stairs', async () => {
  const f = await fight();
  const from = f.nav.nearest({ x: compound.spawn.pos[0], y: 0, z: compound.spawn.pos[2] });
  for (const [name, p] of [['upstairs', { x: -20, y: 3.3, z: -27 }], ['balcony', { x: -25, y: 3.3, z: -16.9 }], ['tower', { x: 30, y: 4, z: 14 }]]) {
    const c = f.nav.nearest(p, { radius: 1 });
    assert.ok(c >= 0 && Math.abs(f.nav.Y[c] - p.y) < 0.05, `${name} is mapped`);
    assert.ok(findPath(f.nav, from, c), `${name} is reachable`);
  }
});

test('fair start: nobody can see you at your spawn, even after a while', async () => {
  const f = await makeFight({ level: compound, god: true });
  const [sx, , sz] = compound.spawn.pos;
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  for (const e of f.list) {
    const eye = e.eye();
    for (const y of [1.1, 1.6]) {
      const d = { x: sx - eye.x, y: y - eye.y, z: sz - eye.z };
      const len = Math.hypot(d.x, d.y, d.z);
      ray.origin = eye;
      ray.dir = { x: d.x / len, y: d.y / len, z: d.z / len };
      assert.ok(f.world.castRay(ray, len, true, undefined, SIGHT), `${e.id} (${e.role}) can't see the spawn`);
    }
  }
  f.run(8);
  for (const e of f.list) assert.ok(!e.inCombat && e.senses.awareness < 0.35, `${e.id} is still calm`);
});

test('the west drain: you can crouch through it, enemies can not path through it', async () => {
  const f = await makeFight({ level: compound, god: true });
  assert.equal(f.nav.cellsAt(-36, 10).length, 0, 'no walkable cell in the drain');
  f.enemies.options.freeze = true;
  f.teleport([-33.5, 0, 10], Math.PI / 2); // facing west
  f.run(0.3, { crouch: true });
  f.run(2.5, { crouch: true, moveZ: 1 });
  assert.ok(f.soldier.state.pos.x < -37, `crawled through (x ${f.soldier.state.pos.x.toFixed(2)})`);
});

test('clearing the Compound: the timer, the results card and the best time', async () => {
  const f = await makeFight({ level: compound, god: true });
  f.enemies.options.freeze = true;
  const store = new Map();
  const records = createRecords({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  const finished = [];
  const start = f.level.expanded.triggers.find((t) => t.id === 'compound:start');
  const enc = createEncounter({ id: 'compound', start, enemies: f.enemies, health: f.health, records, emit: (n, d) => n === 'encounter:finish' && finished.push(d) });
  const tick = (s) => { for (let i = 0; i < s * 60; i++) { f.run(1 / 60); enc.update(1 / 60, f.soldier.state.pos); } };
  tick(1);
  assert.equal(enc.state, 'ready', 'still in the start area');
  f.teleport([-14, 0, 30]);
  tick(1);
  assert.equal(enc.state, 'running');
  for (const e of f.list) {
    f.enemies.damage(e, 999, { zone: 'head', from: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 } });
    enc.onShot();
    enc.onHit({ headshot: true, killed: true });
  }
  tick(0.5);
  assert.equal(enc.state, 'cleared');
  assert.equal(finished.length, 1);
  assert.equal(finished[0].kills, 16);
  assert.equal(finished[0].accuracy, 1);
  assert.equal(records.best('compound'), finished[0].time);

  // Restart: everyone is back.
  f.enemies.reset();
  enc.reset();
  assert.equal(f.enemies.alive.length, 16);
  assert.equal(enc.state, 'ready');
});

test('going down ends the run', async () => {
  const f = await makeFight({ level: compound });
  f.enemies.options.freeze = true;
  const start = f.level.expanded.triggers.find((t) => t.id === 'compound:start');
  const enc = createEncounter({ id: 'compound', start, enemies: f.enemies, health: f.health, records: createRecords(null) });
  f.teleport([-14, 0, 30]);
  enc.update(1 / 60, f.soldier.state.pos);
  f.health.damage(500);
  enc.update(1 / 60, f.soldier.state.pos);
  assert.equal(enc.state, 'down');
});
