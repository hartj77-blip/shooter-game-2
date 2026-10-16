// Grenades (docs/lessons/17-supplies-grenades-and-escorts.md): a projectile
// that flies, bounces and explodes; area damage with falloff; the same flight
// on every computer; enemies who see one coming may run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, createPhysicsWorld } from '../../src/world/physics.js';
import { buildLevel } from '../../src/world/level.js';
import { createGrenades, blast, falloff, throwFrom, GRENADE } from '../../src/weapons/grenades.js';
import { ROLES } from '../../src/ai/enemy-data.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import { makeFight, enemy } from '../support/ai.js';
import { makeCoop } from '../support/coop.js';
import { FLOOR } from '../support/sim.js';
import compound from '../../levels/compound.js';

const WALL = { type: 'wall', from: [-10, -8], to: [10, -8], height: 3 };

async function world(pieces = [WALL]) {
  await initPhysics();
  const w = createPhysicsWorld();
  buildLevel({ name: 'test', spawn: { pos: [0, 0, 0], yaw: 0 }, pieces: [FLOOR, ...pieces] }, w);
  return w;
}

function flyFor(w, throwInfo, seconds) {
  const log = [];
  const g = createGrenades({ world: w, emit: (name, d) => log.push({ name, ...d }) });
  g.spawn({ id: 'a', owner: 0, ...throwInfo, fuse: 99 });
  const path = [];
  for (let t = 0; t < seconds; t += SIM_DT) {
    g.update(SIM_DT);
    path.push({ ...g.list[0].pos });
  }
  return { g: g.list[0], path, log };
}

test('the same throw flies exactly the same way in two separate worlds (so every co-op screen agrees)', async () => {
  const info = throwFrom({ x: 0, y: 1.6, z: 0 }, 0.3, 0.2, { x: 1, y: 0, z: -2 });
  const a = flyFor(await world(compound.pieces), info, 3);
  const b = flyFor(await world(compound.pieces), info, 3);
  assert.deepEqual(a.path, b.path);
  assert.ok(a.log.length >= 1, 'it bounced at least once on the way');
});

test('a throw is rounded to the centimetre (both computers start from the same numbers)', () => {
  const t = throwFrom({ x: 1.23456, y: 1.6, z: -2.98765 }, 0.4, 0.1, { x: 0.333, y: 0, z: -4.1 });
  for (const v of [t.origin, t.vel]) for (const k of ['x', 'y', 'z']) assert.equal(v[k], Math.round(v[k] * 100) / 100);
});

test('it bounces off a wall, then rolls to a stop on the floor', async () => {
  const { g, path } = flyFor(await world(), { origin: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 4, z: -14 } }, 4); // hits the wall about chest high
  const closest = Math.min(...path.map((p) => p.z));
  assert.ok(closest > -8.2 && closest < -7.7, `reached the wall and no further (z ${closest.toFixed(2)})`);
  assert.ok(g.pos.z > closest + 1, 'and came back off it');
  assert.equal(g.resting, true, 'it stopped');
  assert.ok(Math.abs(g.pos.y - GRENADE.size) < 0.05, `lying on the floor (y ${g.pos.y.toFixed(3)})`);
});

test('the blast: full damage close up, fading to nothing at the edge, and walls protect you', async () => {
  assert.equal(falloff(1), 1);
  assert.ok(falloff(4) < falloff(3) && falloff(3) < 1);
  assert.equal(falloff(GRENADE.radius), 0);
  const w = await world();
  const at = (x, z) => ({ thing: { x, z }, points: [{ x, y: 1.2, z }] });
  const hits = blast(w, { x: 0, y: 0.06, z: -5 }, [at(1, -5), at(4, -5), at(0, -12), at(20, -5)]);
  const by = new Map(hits.map((h) => [`${h.thing.x},${h.thing.z}`, h.amount]));
  assert.ok(by.get('1,-5') > by.get('4,-5'), 'closer is worse');
  assert.ok(!by.has('0,-12'), 'behind the wall: nothing');
  assert.ok(!by.has('20,-5'), 'out of reach: nothing');
});

test('throwing: G plays the gesture, the grenade leaves your hand, explodes, and hurts enemies, never you', async () => {
  const f = await makeFight({ pieces: [enemy('rifleman', [0, 0, -6], { yaw: Math.PI })], god: false });
  f.enemies.options.freeze = true;
  ROLES.rifleman.evade = 0; // (this one stands still for the test)
  try {
    const before = f.health.state.hp;
    const thrown = [];
    f.events.on('grenade:throw', (e) => thrown.push(e));
    f.run(GRENADE.release + 0.1, (i) => ({ grenade: i === 0, pitch: -0.6 })); // aimed at the floor: rolls to about 6 m
    assert.equal(thrown.length, 1, 'one grenade');
    assert.equal(f.sim.grenades.list.length, 1, 'in the air');
    f.run(GRENADE.fuse + 0.2, { pitch: -0.6 });
    assert.equal(f.sim.grenades.list.length, 0, 'gone off');
    assert.equal(f.e(0).dead, true, 'the enemy 6 m away');
    assert.equal(f.health.state.hp, before, 'not a scratch on you (friendly fire is off)');
    assert.ok(f.log.some((e) => e.name === 'target:hit' && e.area && e.owner === 0), 'a hit marker for you');
    assert.equal(f.e(0).death.weapon, 'grenade');
  } finally {
    ROLES.rifleman.evade = 0.65;
  }
});

test('you only carry two in a mission; the gesture still plays with none left (it changes nothing else)', async () => {
  const f = await makeFight({ pieces: [], god: true });
  f.sim.player(0).soldier.arsenal.options.infiniteAmmo = false;
  let n = 0;
  f.events.on('grenade:throw', () => n++);
  for (let k = 0; k < 4; k++) f.run(GRENADE.gesture + 0.05, (i) => ({ grenade: i === 0 }));
  assert.equal(n, 2, 'two thrown');
  assert.equal(f.soldier.arsenal.state.grenades, 0);
  f.run(0.1, (i) => ({ grenade: i === 0 }));
  assert.ok(f.soldier.arsenal.state.throwing > 0, 'the arm still goes through the motion');
  f.soldier.arsenal.resupply();
  assert.equal(f.soldier.arsenal.state.grenades, GRENADE.max, 'a crate refills them');
});

test('no shooting mid-throw', async () => {
  const f = await makeFight({ pieces: [], god: true });
  let shots = 0;
  f.events.on('weapon:fire', () => shots++);
  f.run(0.3, (i) => ({ grenade: i === 0, fire: i > 2 }));
  assert.equal(shots, 0);
  f.run(0.6, { fire: true });
  assert.ok(shots > 0, 'and back to it straight after');
});

test('an enemy who sees a grenade land near them runs, after their reaction time, and is out of reach when it goes off', async () => {
  const f = await makeFight({ pieces: [enemy('rifleman', [0, 0, -10], { yaw: 0 })], spawn: [0, 0, 0], god: true });
  const old = ROLES.rifleman.evade;
  ROLES.rifleman.evade = 1;
  try {
    f.run(0.3);
    const e = f.e(0);
    // Facing north (away from you): roll one in front of their face.
    f.sim.throwGrenade(0, { origin: { x: 0, y: 1, z: -12.5 }, vel: { x: 0, y: 0, z: 0 } });
    f.run(0.25);
    assert.notEqual(e.brainState, 'evade', 'not instantly: they need a moment to take it in');
    f.run(0.6);
    assert.equal(e.brainState, 'evade', 'then they run');
    assert.ok(f.count('enemy:bark', (b) => b.kind === 'grenade') >= 1, '"Grenade!"');
    f.run(GRENADE.fuse);
    assert.equal(e.dead, false, 'and they got clear');
    assert.ok(e.inCombat, 'now they know someone is about');
  } finally {
    ROLES.rifleman.evade = old;
  }
});

test('co-op: a client throws, the host decides the blast, the client sees its hit, others see it fly; no corrections', async () => {
  const g = await makeCoop({ def: compound, clients: 2, net: {} });
  g.sim.enemies.options.freeze = true;
  ROLES.rifleman.evade = 0;
  ROLES.rusher.evade = 0;
  try {
    const guard = g.sim.enemies.list[0];
    g.sim.player(1).soldier.teleport([guard.pos.x + 1, 0, guard.pos.z + 4], 0); // just inside the gate
    g.sim.player(2).soldier.teleport([guard.pos.x - 6, 0, guard.pos.z + 14], 0);
    g.run(1);
    const c = g.client(1);
    const before = g.clients.map((x) => x.stats.corrections);
    const yaw = Math.atan2(-(guard.pos.x - c.local.soldier.state.pos.x), -(guard.pos.z - c.local.soldier.state.pos.z));
    g.run(0.5, (slot, i) => (slot === 1 ? { ...idleCommand(yaw, -0.9), grenade: i === 0 } : null)); // at the floor: rolls to about 5 m
    assert.equal(c.grenades.list.length, 1, 'in the air on the thrower’s screen straight away');
    assert.equal(g.sim.grenades.list.length, 1, 'and on the host');
    g.run(0.3);
    assert.equal(g.client(2).grenades.list.length, 1, 'and on the other client, in step with the thrower’s stand-in');
    g.run(GRENADE.fuse);
    assert.equal(guard.dead, true, 'the host’s blast got the guard');
    assert.ok(g.logs.get(1).some((e) => e.name === 'grenade:explode' && e.predicted), 'the thrower saw it go off at once');
    assert.ok(g.logs.get(1).some((e) => e.name === 'target:hit' && e.area && e.owner === 1), 'and got the hit marker from the host');
    assert.equal(g.logs.get(1).filter((e) => e.name === 'grenade:explode').length, 1, 'one bang, not two');
    assert.ok(g.logs.get(2).some((e) => e.name === 'grenade:explode' && !e.predicted), 'the other client heard the host’s bang');
    // G pressed with none left (in a practice map they never run out; take them away):
    c.local.soldier.arsenal.options.infiniteAmmo = false;
    c.local.soldier.arsenal.state.grenades = 0;
    g.run(1, (slot, i) => (slot === 1 ? { ...idleCommand(yaw), grenade: i % 30 === 0, moveZ: 0.5 } : null));
    assert.deepEqual(g.clients.map((x) => x.stats.corrections), before, 'not a single correction');
  } finally {
    ROLES.rifleman.evade = 0.65;
    ROLES.rusher.evade = 0.45;
  }
  g.dispose();
});
