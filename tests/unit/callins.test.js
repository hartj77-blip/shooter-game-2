// Call-ins (game/callins.js): earning the charge, calling one where you look,
// and what each one does. All run with the game's own simulation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeFight, enemy } from '../support/ai.js';
import { makeCoop } from '../support/coop.js';
import { CALLINS } from '../../src/game/callins.js';
import { SIGHT, BULLET } from '../../src/world/groups.js';
import { eventFor } from '../../src/net/protocol.js';
import provingGround from '../../levels/proving-ground.js';

const SOUTH = Math.PI;
const EYE = 1.6;
/** Looking down at the ground `d` metres ahead. */
const atGround = (d) => -Math.atan2(EYE, d);
const WINDUP = CALLINS.windup;

/** Hold enemies where they stand, facing south (they still see, hear and think). */
const pin = (f, spots) => () => f.list.forEach((e, i) => { if (!e.dead) { e.soldier.teleport(spots[i], SOUTH); e.motor.yaw = SOUTH; } });

/** A fight where player 1's call-in is `kind`, already charged. */
async function ready(kind, opts = {}) {
  const f = await makeFight({ god: true, bounds: { min: [-70, -70], max: [70, 70] }, ...opts });
  const me = f.sim.callins.player(0);
  me.kind = kind;
  me.charge = 1;
  return { f, me };
}
const call = (f, d) => f.run(1 / 60, { pitch: atGround(d), callin: true });

test('the charge: earned from kills and objectives (and slowly by itself); each use makes the next one slower', async () => {
  const f = await makeFight();
  const me = f.sim.callins.player(0);
  assert.equal(me.kind, 'supply', 'the default');
  assert.equal(me.charge, 0, 'nobody starts a mission with one ready');
  const refused = [];
  f.events.on('callin:refused', (e) => refused.push(e.reason));
  call(f, 6);
  assert.deepEqual(refused, ['charging']);
  f.events.emit('enemy:down', { owner: 0, headshot: true });
  assert.ok(Math.abs(me.charge - (CALLINS.charge.kill + CALLINS.charge.headshot)) < 1e-3);
  f.events.emit('enemy:down', { owner: 'e3' }); // an enemy's kill (or nobody's): nothing
  f.events.emit('objective:complete', { kind: 'intel' });
  const before = me.charge;
  f.run(10);
  assert.ok(Math.abs(me.charge - before - 10 * CALLINS.charge.perSecond) < 1e-3, 'a trickle every second');
  me.charge = 1;
  call(f, 6);
  assert.ok(me.charge < 1e-3, 'used up');
  f.events.emit('enemy:down', { owner: 0 });
  assert.ok(Math.abs(me.charge - CALLINS.charge.kill / CALLINS.slower) < 1e-3, 'the second charge fills slower');
  assert.equal(f.sim.player(0).view.callin, me.charge, 'everyone can see how charged you are');
});

test('a supply drop: radio, then a crate by parachute; once it lands, hold F for ammo', async () => {
  const { f } = await ready('supply');
  const events = [];
  for (const name of ['callin:call', 'callin:start', 'callin:landed']) f.events.on(name, () => events.push(name));
  call(f, 6);
  const drop = f.sim.callins.active[0];
  assert.ok(Math.abs(drop.pos.z + 6) < 0.3 && Math.abs(drop.pos.y) < 0.05, `on the ground 6 m ahead (${JSON.stringify(drop.pos)})`);
  f.run(WINDUP + CALLINS.supply.fall - 0.5);
  assert.equal(f.sim.spots().filter((s) => s.id === drop.id).length, 0, 'still falling: nothing to use yet');
  f.run(0.6);
  assert.deepEqual(events, ['callin:call', 'callin:start', 'callin:landed']);
  const soldier = f.soldier;
  soldier.arsenal.options.infiniteAmmo = false; // (a practice level: spares never run out)
  soldier.arsenal.load([[30, 0]]);
  f.teleport([drop.pos.x, 0, drop.pos.z + 1]);
  f.run(CALLINS.supply.useTime + 0.2, { interact: true });
  assert.ok(soldier.arsenal.guns[0].reserve > 0, 'spare ammo back');
  assert.equal(drop.left, CALLINS.supply.refills - 1);
});

test('supply and mortar need open sky above the spot; the call is refused (and kept) under a roof', async () => {
  const { f, me } = await ready('mortar', { pieces: [{ type: 'box', size: [12, 0.3, 12], at: [0, 4, -6] }] });
  const refused = [];
  f.events.on('callin:refused', (e) => refused.push(e.reason));
  call(f, 5);
  assert.deepEqual(refused, ['sky']);
  assert.equal(me.charge, 1, 'still ready');
  me.kind = 'smoke';
  call(f, 5);
  assert.equal(f.sim.callins.active.length, 1, 'smoke works anywhere');
});

test('a mortar strike: red smoke warns first, then the shells hurt enemies near it, and never the squad', async () => {
  const pieces = [enemy('rifleman', [0, 0, -12], { yaw: SOUTH }), enemy('rifleman', [2, 0, -13], { yaw: SOUTH })];
  const { f } = await ready('mortar', { pieces, seed: 5 });
  const hold = pin(f, [[0, 0, -12], [2, 0, -13]]);
  const hp0 = f.list.map((e) => e.health);
  const blasts = [];
  f.events.on('explosion', (e) => { if (e.kind === 'mortar') blasts.push(e); });
  call(f, 12);
  f.run(WINDUP + 0.2, {}, hold);
  assert.ok(f.list.some((e) => e.senses.hazard), 'the enemies have seen the red smoke');
  f.run(CALLINS.mortar.warn - 0.4, {}, hold);
  assert.equal(blasts.length, 0, `nothing lands during the warning (${CALLINS.mortar.warn} s)`);
  f.teleport([0, 0, -9]); // a player wanders in under it
  f.run(CALLINS.mortar.over + 0.8, {}, hold);
  assert.equal(blasts.length, CALLINS.mortar.shells);
  assert.ok(blasts.every((b) => b.owner === 0), 'your shells (your kills)');
  assert.ok(f.list.every((e, i) => e.dead || e.health < hp0[i]), 'both guards are hurt');
  assert.equal(f.health.state.hp, f.health.tuning.max, 'the player under it is untouched');
  assert.equal(f.sim.callins.active.length, 0, 'over');
});

test('the shells land in the same places on a replay (seeded)', async () => {
  const where = async () => {
    const { f } = await ready('mortar', { seed: 9 });
    const out = [];
    f.events.on('explosion', (e) => out.push(`${e.pos.x},${e.pos.z}`));
    call(f, 10);
    f.run(WINDUP + CALLINS.mortar.warn + CALLINS.mortar.over + 0.5);
    return out;
  };
  assert.deepEqual(await where(), await where());
});

test('a smoke screen blocks eyes, not bullets: the guard loses sight of you, and you can still hit them', async () => {
  const pieces = [enemy('rifleman', [0, 0, -20], { yaw: SOUTH })];
  const { f } = await ready('smoke', { pieces });
  const hold = pin(f, [[0, 0, -20]]);
  f.run(1, {}, hold);
  assert.ok(f.e().senses.visible, 'they see you');
  call(f, 10);
  f.run(WINDUP + 0.2, {}, hold);
  const smoke = f.sim.callins.active[0];
  assert.equal(smoke.clouds.length, CALLINS.smoke.clouds);
  // Straight through the middle of it: eyes stop, bullets don't.
  const ray = new RAPIER.Ray({ x: 0, y: EYE, z: -1 }, { x: 0, y: 0, z: -1 }); // (from just in front of your own hitboxes)
  assert.ok(f.world.castRay(ray, 17, true, undefined, SIGHT), 'eyesight hits the smoke');
  assert.equal(f.world.castRay(ray, 17, true, undefined, BULLET), null, 'bullets fly through');
  f.run(0.5, {}, hold);
  assert.equal(f.e().senses.visible, false, 'they lost sight of you');
  const hits = () => f.count('target:hit', (e) => e.kind === 'enemy');
  const chest = Math.atan2(1.25 - EYE, 20);
  f.run(1.5, (i) => ({ pitch: chest, ads: true, fire: i > 20 && i % 8 === 0, firePressed: i > 20 && i % 8 === 0 }), hold);
  assert.ok(hits() > 0, 'shooting blind into the smoke still hits');
  f.run(CALLINS.smoke.duration);
  assert.equal(f.world.castRay(ray, 17, true, undefined, SIGHT), null, 'it clears');
});

test('a recon drone marks every enemy near the spot for the squad, until it leaves', async () => {
  const pieces = [enemy('rifleman', [0, 0, -25], { yaw: SOUTH }), enemy('rifleman', [0, 0, -65], { yaw: SOUTH })];
  const { f } = await ready('recon', { pieces });
  f.enemies.options.freeze = true; // (marking doesn't need them to see anything)
  call(f, 8);
  f.run(WINDUP + 0.1);
  assert.equal(f.e(0).view.marked, true, '25 m from the drone: marked');
  assert.equal(f.e(1).view.marked, false, '57 m away: not');
  f.run(CALLINS.recon.duration + 1.2);
  assert.equal(f.e(0).view.marked, false, 'the drone has gone home');
});

test('a restart clears the sky and the charge; the Proving Ground is always charged', async () => {
  const { f, me } = await ready('smoke');
  call(f, 8);
  f.run(WINDUP + 0.1);
  f.sim.reset();
  assert.equal(f.sim.callins.active.length, 0);
  assert.equal(me.charge, 0);
  const p = await makeFight({ level: provingGround });
  assert.equal(p.sim.callins.player(0).charge, 1);
});

test('co-op: a friend calls smoke; the host decides it, and their browser draws it and adds the same smoke', async () => {
  const g = await makeCoop({ def: provingGround, clients: 1, callins: { 1: 'smoke' } });
  g.run(1);
  const c = g.client(1);
  assert.equal(c.local.callin.kind, 'smoke');
  assert.equal(c.local.callin.charge, 1, 'the host says it is ready');
  const yaw = c.local.soldier.state.yaw;
  g.run(1 / 60, (slot) => (slot === 1 ? { ...c.local.soldier.state, moveX: 0, moveZ: 0, yaw, pitch: atGround(8), callin: true } : null));
  g.run(WINDUP + 0.5);
  const smoke = c.callins.view.find((x) => x.kind === 'smoke');
  assert.ok(smoke && smoke.phase === 'active' && smoke.clouds.length === CALLINS.smoke.clouds, 'the client knows where the smoke is');
  assert.ok(g.logs.get(1).some((e) => e.name === 'callin:call' && e.owner === 1));
  // The client's own world has the smoke too (its aim assist looks through SIGHT).
  const mid = smoke.clouds[1];
  const s = c.local.soldier.state.pos;
  const d = { x: mid.x - s.x, y: mid.y - (s.y + EYE), z: mid.z - s.z };
  const len = Math.hypot(d.x, d.y, d.z);
  const ray = new RAPIER.Ray({ x: s.x, y: s.y + EYE, z: s.z }, { x: d.x / len, y: d.y / len, z: d.z / len });
  assert.ok(c.world.castRay(ray, len + 1, true, undefined, SIGHT), 'smoke in the client\'s world');
  g.dispose();
});

test('"not ready" and "ready" are only told to the player they are about', () => {
  assert.equal(eventFor('callin:refused', { owner: 2, reason: 'sky' }, 2), true);
  assert.equal(eventFor('callin:refused', { owner: 2, reason: 'sky' }, 1), false);
  assert.equal(eventFor('callin:start', { owner: 2, kind: 'mortar' }, 1), true, 'everyone sees a mortar coming');
});
