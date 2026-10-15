// Target and kill house tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRange } from '../support/combat.js';
import { traceShot } from '../../src/weapons/hitscan.js';
import { WEAPONS } from '../../src/weapons/weapons-data.js';
import { createCourse, createRecords, HOSTAGE_PENALTY } from '../../src/game/course.js';
import { createRandom } from '../../src/core/random.js';

const SHOT = (z) => ({ weapon: WEAPONS.carbine, origin: { x: 0, y: 1.2, z: 0 }, dir: { x: 0, y: 0, z: -1 } });

test('seeded random numbers repeat exactly, and differ between seeds', () => {
  const a = createRandom(5);
  const b = createRandom(5);
  const c = createRandom(6);
  const seqA = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 5 }, () => b.next()));
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => c.next()));
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  const saved = a.state;
  const next = a.next();
  a.state = saved;
  assert.equal(a.next(), next, 'restoring the state replays the sequence');
});

test('a paper target falls after 100 damage, ignores bullets while down, then pops back up', async () => {
  const r = await makeRange([{ type: 'target', kind: 'paper', at: [0, 0, -10] }]);
  const t = r.targets.list[0];
  for (let i = 0; i < 3; i++) assert.equal(r.targets.damage(t, 30).killed, false);
  assert.equal(r.targets.damage(t, 30).killed, true);
  assert.equal(t.state, 'falling');
  r.run(0.5);
  assert.equal(t.state, 'down');
  assert.equal(traceShot(r.world, r.registry, SHOT(), r.soldier.body.collider).hits[0]?.target, undefined, 'bullets pass over it');
  r.run(3.5);
  assert.equal(t.state, 'up');
  assert.equal(t.health, 100);
  assert.equal(traceShot(r.world, r.registry, SHOT(), r.soldier.body.collider).hits[0].target, t, 'hittable again');
});

test('pop-ups start down and rise when raised', async () => {
  const r = await makeRange([{ type: 'target', kind: 'popup', group: 'g', at: [0, 0, -10] }]);
  const t = r.targets.list[0];
  assert.equal(t.state, 'down');
  r.targets.raiseGroup('g');
  r.run(0.5);
  assert.equal(t.state, 'up');
  assert.equal(t.health, 50);
});

test('steel plates never fall, they just ring', async () => {
  const r = await makeRange([{ type: 'target', kind: 'steel', at: [0, 0, -10] }]);
  const t = r.targets.list[0];
  for (let i = 0; i < 20; i++) assert.equal(r.targets.damage(t, 60).killed, false);
  assert.equal(t.state, 'up');
  assert.equal(t.hitCount, 20);
});

test('a moving target slides between the ends of its rail, and its colliders follow', async () => {
  const r = await makeRange([{ type: 'target', kind: 'mover', at: [-4, 0, -10], to: [4, 0, -10], speed: 4 }]);
  const t = r.targets.list[0];
  r.run(1);
  assert.ok(Math.abs(t.pos.x) < 0.2, `halfway after 1 s, x = ${t.pos.x.toFixed(2)}`);
  r.run(1.2);
  assert.ok(t.pos.x < 4 && t.rail.dir === -1, 'turned around at the end');
  assert.ok(Math.abs(t.colliders[1].translation().x - t.pos.x) < 1e-3);
});

function fakeStorage() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
}

async function killHouse() {
  const r = await makeRange([
    { type: 'target', kind: 'popup', group: 'kh', at: [0, 0, -10] },
    { type: 'target', kind: 'popup', group: 'kh', at: [2, 0, -10] },
    { type: 'target', kind: 'hostage', group: 'kh', at: [4, 0, -10] },
  ]);
  const storage = fakeStorage();
  const course = createCourse({
    id: 'kh',
    start: { min: [-1, 0, -1], max: [1, 3, 1] },
    finish: { min: [9, 0, -1], max: [11, 3, 1] },
    targets: r.targets,
    records: createRecords(storage),
  });
  return { r, course, storage };
}

test('kill house: the timer starts when you step off the start pad', async () => {
  const { r, course } = await killHouse();
  course.update(1 / 60, { x: 0, y: 0, z: 0 });
  assert.equal(course.state, 'ready');
  assert.ok(r.targets.list.every((t) => t.state === 'down'));
  course.update(1 / 60, { x: 3, y: 0, z: 0 });
  assert.equal(course.state, 'running');
  assert.ok(r.targets.list.every((t) => t.state !== 'down'), 'targets pop up');
  for (let i = 0; i < 60; i++) course.update(1 / 60, { x: 5, y: 0, z: 0 });
  assert.ok(Math.abs(course.time - 1) < 0.02);
});

test('kill house: you can only finish once every hostile is down; hostages cost time', async () => {
  const { r, course, storage } = await killHouse();
  course.update(1 / 60, { x: 0, y: 0, z: 0 });
  course.update(1 / 60, { x: 3, y: 0, z: 0 });
  r.run(0.5);
  const [a, b, hostage] = r.targets.list;
  course.update(1, { x: 10, y: 0, z: 0 });
  assert.equal(course.state, 'running', 'blocked: targets still up');
  assert.equal(course.remaining, 2);

  for (const t of [a, b]) {
    course.onShot();
    r.targets.damage(t, 60);
    course.onHit(t, { headshot: t === a });
  }
  course.onShot();
  r.targets.damage(hostage, 30);
  course.onHit(hostage);
  course.onShot(); // a miss
  course.update(1, { x: 10, y: 0, z: 0 });
  assert.equal(course.state, 'done');
  const res = course.result;
  assert.equal(res.hostageHits, 1);
  assert.equal(res.penalty, HOSTAGE_PENALTY);
  assert.ok(Math.abs(res.total - (res.time + HOSTAGE_PENALTY)) < 1e-9);
  assert.equal(res.headshots, 1);
  assert.equal(res.accuracy, 0.5, '2 hostile hits from 4 shots');
  assert.equal(res.record, true, 'first run is a record');
  assert.ok(JSON.parse(storage.data['fireteam.records']).kh > 0, 'best time saved');
});

test('records keep only the best time and survive corrupt storage', () => {
  const storage = fakeStorage();
  storage.setItem('fireteam.records', '{oops');
  const rec = createRecords(storage);
  assert.equal(rec.best('kh'), null);
  assert.equal(rec.submit('kh', 30), true);
  assert.equal(rec.submit('kh', 35), false);
  assert.equal(rec.submit('kh', 25), true);
  assert.equal(createRecords(storage).best('kh'), 25);
});
