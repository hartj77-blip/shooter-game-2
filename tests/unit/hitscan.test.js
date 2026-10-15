// Hitscan tests: rays, hit zones, damage and penetration (docs/lessons/05-how-shooting-works.md).
// These fire perfectly straight test shots by hand, so there's no randomness.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRange } from '../support/combat.js';
import { traceShot } from '../../src/weapons/hitscan.js';
import { lookDirection } from '../../src/weapons/arsenal.js';
import { WEAPONS } from '../../src/weapons/weapons-data.js';

const EYE = 1.68;

/** A straight shot from (0, EYE, 0) at a point. */
function shotAt(weapon, x, y, z) {
  const d = { x, y: y - EYE, z };
  const len = Math.hypot(d.x, d.y, d.z);
  return { weapon: WEAPONS[weapon], origin: { x: 0, y: EYE, z: 0 }, dir: { x: d.x / len, y: d.y / len, z: d.z / len } };
}

const paperAt = (z) => ({ type: 'target', kind: 'paper', at: [0, 0, z] });

test('a headshot does double damage, a leg shot three quarters', async () => {
  const r = await makeRange([paperAt(-10)]);
  const trace = (y) => traceShot(r.world, r.registry, shotAt('carbine', 0, y, -10), r.soldier.body.collider);
  const head = trace(1.63).hits[0];
  const body = trace(1.2).hits[0];
  const leg = trace(0.5).hits[0];
  assert.equal(head.zone, 'head');
  assert.equal(head.damage, 60);
  assert.equal(body.zone, 'body');
  assert.equal(body.damage, 30);
  assert.equal(leg.zone, 'limb');
  assert.equal(leg.damage, 22.5);
});

test('damage drops with distance', async () => {
  const r = await makeRange([paperAt(-55)]);
  const hit = traceShot(r.world, r.registry, shotAt('carbine', 0, 1.2, -55), r.soldier.body.collider).hits[0];
  assert.ok(hit.damage < 30 && hit.damage > 22, `got ${hit.damage}`);
});

test('bullets go through a thin wooden wall, with less damage', async () => {
  const r = await makeRange([
    { type: 'box', size: [3, 3, 0.12], at: [0, 0, -5], mat: 'plank' },
    paperAt(-10),
  ]);
  const { hits } = traceShot(r.world, r.registry, shotAt('carbine', 0, 1.2, -10), r.soldier.body.collider);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].surface, 'wood');
  assert.ok(hits[0].penetrated);
  assert.equal(hits[1].zone, 'body');
  assert.ok(hits[1].damage < 30 && hits[1].damage > 20, `reduced damage ${hits[1].damage}`);
});

test('a thick crate or a concrete wall stops the bullet', async () => {
  for (const mat of ['crate', 'concrete']) {
    const r = await makeRange([
      { type: 'box', size: [3, 3, 1], at: [0, 0, -5], mat },
      paperAt(-10),
    ]);
    const { hits } = traceShot(r.world, r.registry, shotAt('carbine', 0, 1.2, -10), r.soldier.body.collider);
    assert.equal(hits.length, 1, `${mat} stopped it`);
    assert.ok(!hits[0].target);
  }
});

test('the shotgun pellet cannot punch through even a thin wall', async () => {
  const r = await makeRange([
    { type: 'box', size: [3, 3, 0.2], at: [0, 0, -5], mat: 'plank' },
    paperAt(-10),
  ]);
  const { hits } = traceShot(r.world, r.registry, shotAt('shotgun', 0, 1.2, -10), r.soldier.body.collider);
  assert.equal(hits.length, 1);
});

test('nothing is hit beyond a gun\'s range', async () => {
  const r = await makeRange([paperAt(-80)]);
  const hits = traceShot(r.world, r.registry, shotAt('shotgun', 0, 1.2, -80), r.soldier.body.collider).hits;
  assert.equal(hits.length, 0, 'shotgun range is 60 m');
});

test('you never shoot yourself', async () => {
  const r = await makeRange();
  r.settle();
  const eye = { x: 0, y: 1.0, z: 0 }; // inside the player's own body
  const shot = { weapon: WEAPONS.carbine, origin: eye, dir: lookDirection(0, -0.2) };
  const { hits } = traceShot(r.world, r.registry, shot, r.soldier.body.collider);
  assert.equal(hits[0].surface, 'dirt', 'went straight to the floor');
});

test('firing the real gun at a target hits it and reports the hit', async () => {
  const r = await makeRange([paperAt(-6)]);
  r.settle();
  r.run(0.4, { ads: true });
  const pitch = Math.atan2(1.2 - EYE, 6);
  r.look.pitch = pitch;
  r.run(0.1, (i) => ({ ads: true, fire: i === 0, firePressed: i === 0 }));
  const hit = r.log.find((e) => e.name === 'target:hit');
  assert.ok(hit, 'hit the target');
  assert.equal(hit.zone, 'body');
  assert.equal(r.targets.list[0].health, 70);
});
