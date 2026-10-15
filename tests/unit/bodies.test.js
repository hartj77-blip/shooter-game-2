// Bodies, hitboxes, collision groups and health (docs/lessons/10-health-hits-and-bodies.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRange } from '../support/combat.js';
import { traceShot } from '../../src/weapons/hitscan.js';
import { WEAPONS } from '../../src/weapons/weapons-data.js';
import { createSoldier } from '../../src/player/soldier.js';
import { createHitboxes } from '../../src/player/hitboxes.js';
import { createHealth } from '../../src/player/health.js';
import { createEvents } from '../../src/core/events.js';

const EYE = 1.68;
const shotAt = (x, y, z) => {
  const d = { x, y: y - EYE, z };
  const len = Math.hypot(d.x, d.y, d.z);
  return { weapon: WEAPONS.carbine, origin: { x: 0, y: EYE, z: 0 }, dir: { x: d.x / len, y: d.y / len, z: d.z / len } };
};

/** A range with a second soldier ("Bravo") standing 10 m north, facing you. */
async function withBravo() {
  const r = await makeRange();
  const bravo = createSoldier({
    world: r.world, registry: r.registry, events: createEvents(), owner: 'b',
    spawn: { pos: [0, 0, -10], yaw: Math.PI }, entity: { kind: 'enemy', id: 'bravo' },
  });
  r.settle();
  for (let i = 0; i < 30; i++) {
    bravo.move({ moveX: 0, moveZ: 0, yaw: Math.PI, pitch: 0 }, 1 / 60);
    r.world.step();
  }
  return { r, bravo };
}

test('bullets hit hitboxes, with zones, but pass the fat movement cylinder', async () => {
  const { r, bravo } = await withBravo();
  const head = traceShot(r.world, r.registry, shotAt(0, 1.62, -10), r.soldier).hits[0];
  assert.equal(head.target, bravo.entity);
  assert.equal(head.zone, 'head');
  assert.equal(head.surface, 'flesh');
  const body = traceShot(r.world, r.registry, shotAt(0, 1.1, -10), r.soldier).hits[0];
  assert.equal(body.zone, 'body');
  // 0.3 m to the side of the head: inside the movement cylinder (radius 0.35), outside every hitbox.
  const past = traceShot(r.world, r.registry, shotAt(0.3, 1.66, -10), r.soldier).hits[0];
  assert.notEqual(past?.target, bravo.entity, 'a shot past the ear misses');
});

test('your own bullets never hit your own hitboxes', async () => {
  const { r } = await withBravo();
  // Fired from inside your own head box, straight up: nothing to hit.
  const shot = { weapon: WEAPONS.carbine, origin: { x: 0, y: EYE, z: 0 }, dir: { x: 0, y: 1, z: 0 } };
  assert.equal(traceShot(r.world, r.registry, shot, r.soldier).hits.length, 0);
  r.run(0.2, { fire: true, firePressed: true });
  assert.ok(!r.log.some((e) => e.name === 'target:hit' && e.kind === 'player'), 'no self-hits');
});

test('crouching lowers the head hitbox', async () => {
  const { r, bravo } = await withBravo();
  for (let i = 0; i < 30; i++) {
    bravo.move({ moveX: 0, moveZ: 0, yaw: Math.PI, pitch: 0, crouch: true }, 1 / 60);
    r.world.step();
  }
  assert.equal(bravo.state.crouched, true);
  const high = traceShot(r.world, r.registry, shotAt(0, 1.62, -10), r.soldier).hits[0];
  assert.notEqual(high?.target, bravo.entity, 'standing head height now misses');
  const low = traceShot(r.world, r.registry, shotAt(0, 0.99, -10), r.soldier).hits[0];
  assert.equal(low.zone, 'head');
});

test('walking ignores hitboxes but not other soldiers', async () => {
  const r = await makeRange();
  // A loose set of hitboxes 2 m ahead (with no body): you walk straight through it.
  const ghost = createHitboxes(r.world, r.registry, { kind: 'enemy', id: 'ghost' });
  ghost.sync({ x: 0, y: 0, z: -2 }, 0, false);
  r.world.step();
  r.settle();
  r.run(1.2, { moveZ: 1 });
  assert.ok(r.soldier.state.pos.z < -3.5, `walked through the hitboxes (z ${r.soldier.state.pos.z.toFixed(2)})`);

  // A real soldier in the way blocks you.
  const r2 = await makeRange();
  createSoldier({ world: r2.world, registry: r2.registry, events: createEvents(), owner: 'b', spawn: { pos: [0, 0, -2], yaw: 0 } });
  r2.world.step();
  r2.settle();
  r2.run(1.2, { moveZ: 1 });
  assert.ok(r2.soldier.state.pos.z > -1.7, `blocked by the other soldier (z ${r2.soldier.state.pos.z.toFixed(2)})`);
});

test('flat zones: no headshot bonus against a soldier that has them', async () => {
  const r = await makeRange();
  const you = createSoldier({
    world: r.world, registry: r.registry, events: createEvents(), owner: 'y', flatZones: true,
    spawn: { pos: [0, 0, -10], yaw: Math.PI },
  });
  r.world.step();
  r.settle();
  you.move({ moveX: 0, moveZ: 0, yaw: Math.PI, pitch: 0 }, 1 / 60);
  r.world.step();
  const head = traceShot(r.world, r.registry, shotAt(0, 1.62, -10), r.soldier).hits[0];
  assert.equal(head.zone, 'body');
  assert.equal(head.target.kind, 'player');
});

test('health: hits, the wait, recovery, going down, god mode', () => {
  const events = createEvents();
  const log = [];
  events.on('player:hurt', (e) => log.push(['hurt', e.amount]));
  events.on('player:down', () => log.push(['down']));
  const h = createHealth({ events });
  h.damage(30, { x: 0, y: 0, z: -5 });
  assert.equal(h.state.hp, 70);
  for (let i = 0; i < 60 * 4; i++) h.update(1 / 60); // 4 s: still waiting
  assert.equal(h.state.hp, 70);
  for (let i = 0; i < 60 * 1; i++) h.update(1 / 60); // past 4.5 s: recovering
  assert.ok(h.state.hp > 70 && h.state.hp < 100);
  for (let i = 0; i < 60 * 3; i++) h.update(1 / 60);
  assert.equal(h.state.hp, 100);

  h.damage(60);
  h.damage(60);
  assert.equal(h.state.down, true);
  assert.equal(h.state.hp, 0);
  assert.equal(h.damage(10).killed, false, 'no more damage once down');
  assert.deepEqual(log.at(-1), ['down']);
  assert.equal(h.state.taken, 130);

  h.reset();
  h.godMode = true;
  h.damage(500);
  assert.equal(h.state.hp, 100);
  assert.equal(h.state.down, false);
});
