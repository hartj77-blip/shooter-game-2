// Missions (docs/lessons/14-missions-as-data.md): objectives one after
// another, checkpoints, retrying, and the helicopter home. Played on a small
// flat test map (tests/support/missions.js) by scripted commands.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFight } from '../support/ai.js';
import { yard, RESCUE, INTEL, SABOTAGE, HOLD, walk, holdF } from '../support/missions.js';
import { HELI } from '../../src/game/helicopter.js';
import { OBJECTIVES } from '../../src/game/objectives.js';
import { createRecords } from '../../src/game/course.js';

const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;
const LZ = { x: 0, z: 22 };

test('rescue: free the hostage, they follow you to the helicopter, it lands, you board, mission complete', async () => {
  const f = await makeFight({ level: yard(RESCUE), god: true });
  const op = f.sim.operation;
  f.enemies.options.freeze = true;
  assert.equal(op.view.kind, 'rescue');
  assert.equal(op.view.phase, 'find');
  const h = f.sim.hostage;
  assert.ok(h && near(h.pos, { x: 20, z: -10 }, 0.5), 'held at the hut');
  assert.equal(h.view.captive, true);

  walk(f, { x: 20, z: -8.8 });
  holdF(f, OBJECTIVES.free + 0.2);
  assert.equal(h.state, 'following', 'untied');
  assert.equal(op.view.kind, 'extract', 'on to the helicopter');
  assert.equal(op.view.phase, 'call');
  assert.equal(op.checkpoint?.n, 1, 'a checkpoint');

  // Walk to the landing zone's radio: the hostage keeps up.
  walk(f, { x: 7, z: 21 });
  f.run(2); // (they catch up when you stop)
  assert.ok(near(h.pos, f.soldier.state.pos, 4.5), `they followed (${Math.hypot(h.pos.x - f.soldier.state.pos.x, h.pos.z - f.soldier.state.pos.z).toFixed(1)} m behind)`);
  holdF(f, OBJECTIVES.radio + 0.2);
  assert.equal(op.view.phase, 'inbound', 'the helicopter is on its way');
  f.run(5 + HELI.landing + 0.2);
  assert.equal(op.view.phase, 'landed');
  // Everyone into the landing zone (the hostage follows).
  walk(f, LZ);
  f.run(1.5);
  assert.equal(h.state, 'aboard');
  f.run(HELI.leaving + 0.5);
  assert.equal(op.state, 'complete', 'mission complete');
  assert.ok(op.result && op.result.time > 10, 'with a time');
});

test('the helicopter will not leave without the hostage, or with anyone bleeding out', async () => {
  const f = await makeFight({ level: yard({ ...RESCUE, stages: [{ kind: 'rescue', sites: ['hut'] }, { kind: 'extract', lz: 'lz', called: true, inbound: 1 }] }), god: true });
  f.enemies.options.freeze = true;
  walk(f, { x: 20, z: -8.8 });
  holdF(f, OBJECTIVES.free + 0.2);
  // Run to the pad alone, far faster than the hostage can keep up: teleport.
  f.teleport([0, 0, 22]);
  f.run(1 + HELI.landing + HELI.leaving + 2);
  assert.notEqual(f.sim.operation.state, 'complete', 'no lift-off without them');
  assert.equal(f.sim.operation.view.phase, 'landed', 'it waits');
});

test('the hostage: stray enemy bullets hurt them, yours pass through, they can be revived, and if they bleed out the mission fails', async () => {
  const f = await makeFight({ level: yard(RESCUE), god: true });
  f.enemies.options.freeze = true;
  const h = f.sim.hostage;
  const guard = f.e(0);
  f.enemies.ai.hurt(guard, h.entity, 40, { from: guard.pos });
  assert.ok(h.health.state.hp < 100 && h.health.state.hp > 80, `a stray shot hurts (${h.health.state.hp})`);
  // Your bullets: stand behind them and fire through them.
  f.teleport([20, 0, -6], 0);
  const before = h.health.state.hp;
  f.run(0.6, { fire: true, pitch: 0.02 });
  assert.equal(h.health.state.hp, before, 'friendly fire is off');
  // Down: revive them like a teammate.
  h.health.damage(1000);
  assert.equal(h.health.state.bleeding, true);
  f.teleport([20, 0, -8.8], Math.PI);
  holdF(f, 3.2);
  assert.equal(h.health.state.bleeding, false, 'back up');
  assert.ok(h.health.state.hp > 0);
});

test('a freed hostage who bleeds out fails the mission', async () => {
  const f = await makeFight({ level: yard(RESCUE), god: true });
  f.enemies.options.freeze = true;
  walk(f, { x: 20, z: -8.8 });
  holdF(f, OBJECTIVES.free + 0.2);
  const failed = [];
  f.events.on('mission:failed', (e) => failed.push(e));
  f.sim.hostage.health.damage(1000);
  f.run(46);
  assert.equal(f.sim.operation.state, 'failed');
  assert.equal(failed[0]?.reason, 'hostage');
});

test('intel: start the download, enemies close by and none of you stall it, take the drive, carry it home', async () => {
  const f = await makeFight({ level: yard(INTEL), god: true });
  const op = f.sim.operation;
  f.enemies.options.freeze = true;
  walk(f, { x: -20, z: -8.8 });
  holdF(f, OBJECTIVES.laptop + 0.1);
  assert.equal(op.view.phase, 'download');
  f.run(1);
  const p1 = op.view.progress;
  assert.ok(p1 > 0.15 && p1 < 0.4, `downloading (${p1.toFixed(2)})`);
  // Walk away; an enemy appears beside the laptop: it stalls.
  f.teleport([0, 0, 30]);
  f.enemies.spawn({ role: 'rifleman', at: [-21, 0, -12] });
  f.run(1.5);
  assert.equal(op.view.contested, true, 'contested');
  const stalled = op.view.progress;
  f.run(1);
  assert.equal(op.view.progress, stalled);
  // Back to defend it: progress again, then the drive.
  f.teleport([-20, 0, -8.8], Math.PI);
  f.run(4);
  assert.equal(op.view.phase, 'collect');
  holdF(f, OBJECTIVES.drive + 0.1);
  assert.equal(op.view.kind, 'extract');
  assert.equal(op.view.carrier, 0, 'you have the drive');
  assert.equal(op.checkpoint.n, 1);
});

test('co-op intel: whoever carries the drive bleeds out, it drops there, and a teammate picks it up', async () => {
  const f = await makeFight({ level: yard(INTEL), god: true, players: 2 });
  const op = f.sim.operation;
  f.enemies.options.freeze = true;
  walk(f, { x: -20, z: -8.8 });
  holdF(f, OBJECTIVES.laptop + 0.1, [0]);
  f.run(4.5);
  holdF(f, OBJECTIVES.drive + 0.1, [0]);
  assert.equal(op.view.carrier, 0);
  const carrier = f.sim.player(0);
  carrier.health.godMode = false;
  carrier.health.damage(500);
  carrier.health.state.dead = true; // (out for good)
  f.run(0.1);
  assert.equal(op.view.carrier, null, 'dropped');
  assert.ok(op.view.drop && near(op.view.drop, carrier.soldier.state.pos, 0.1), 'where they fell');
  f.sim.player(1).soldier.teleport([carrier.soldier.state.pos.x + 0.6, 0, carrier.soldier.state.pos.z], 0);
  f.run(0.1);
  holdF(f, OBJECTIVES.drive + 0.1, [1]);
  assert.equal(op.view.carrier, 1, 'picked up by the other player');
});

test('sabotage: plant a charge on each cache; each blast destroys it (and anyone near), saves a checkpoint, and three end the stage', async () => {
  const f = await makeFight({ level: yard(SABOTAGE), god: true });
  const op = f.sim.operation;
  f.enemies.options.freeze = true;
  assert.deepEqual(op.view.sites.length, 3);
  const victim = f.enemies.spawn({ role: 'rifleman', at: [-11, 0, 3] });
  const blasts = [];
  const destroyed = [];
  f.events.on('explosion', (e) => blasts.push(e));
  f.events.on('objective:destroyed', (e) => destroyed.push(e.index));
  for (const [i, c] of [[-10, 2], [10, 2], [0, -16]].entries()) {
    walk(f, { x: c[0], z: c[1] + 1.4 });
    holdF(f, OBJECTIVES.plant + 0.1);
    assert.ok(op.view.armed & (1 << i), `charge ${i + 1} planted`);
    walk(f, { x: c[0], z: c[1] + 14 }, 4); // get clear (it would not hurt you, but still)
    f.run(2.2);
    assert.ok(destroyed.includes(i), `cache ${i + 1} destroyed`);
  }
  assert.equal(blasts.filter((b) => b.kind === 'charge').length, 3);
  assert.equal(victim.dead, true, 'the enemy by the first cache');
  assert.equal(op.view.kind, 'extract');
  assert.equal(op.checkpoint.n, 3, 'a checkpoint for each');
  assert.equal(f.health.state.hp, 100);
});

test('hold the line: progress only while one of you is inside and no enemy is; done, the helicopter is already coming', async () => {
  const f = await makeFight({ level: yard(HOLD), god: true });
  const op = f.sim.operation;
  f.enemies.options.freeze = true;
  walk(f, { x: 0, z: -2.6 });
  holdF(f, OBJECTIVES.radio + 0.1);
  assert.equal(op.view.phase, 'hold');
  f.run(2);
  assert.ok(op.view.progress > 0.25 && op.view.progress < 0.45, `holding (${op.view.progress.toFixed(2)})`);
  const e = f.enemies.spawn({ role: 'rusher', at: [3, 0, -6] });
  f.run(1);
  assert.equal(op.view.contested, true);
  const was = op.view.progress;
  f.run(1);
  assert.equal(op.view.progress, was, 'stalled with an enemy inside');
  f.enemies.retire(e);
  f.teleport([20, 0, 20]);
  f.run(1);
  assert.equal(op.view.progress, was, 'and with nobody inside');
  f.teleport([0, 0, -3]);
  f.run(5);
  assert.equal(op.view.kind, 'extract');
  assert.equal(op.view.phase, 'inbound', 'no need to call it');
});

test('checkpoint retry: guards dealt with before it stay gone, later ones come back calm, reinforcements go, ammo is what you had', async () => {
  const f = await makeFight({ level: yard(RESCUE), god: false });
  f.enemies.options.freeze = true;
  const sim = f.sim;
  const [g0, g1] = f.list;
  f.enemies.damage(g0, 1000, { owner: 0, zone: 'body', from: g0.pos }); // before the checkpoint
  walk(f, { x: 20, z: -8.8 });
  f.soldier.arsenal.load([[12, 40]]);
  holdF(f, OBJECTIVES.free + 0.2);
  assert.equal(sim.operation.checkpoint.n, 1);
  // After the checkpoint: kill the other guard, a wave arrives, you spend ammo... and go down.
  f.enemies.damage(g1, 1000, { owner: 0, zone: 'body', from: g1.pos });
  sim.director.wave({ size: 3, reason: 'test' });
  assert.equal(f.enemies.alive.length, 3);
  f.soldier.arsenal.load([[2, 0]]);
  f.health.damage(500);
  f.run(0.1);
  assert.equal(sim.operation.state, 'failed');
  assert.equal(sim.operation.reason, 'down');

  const n = sim.retry();
  assert.equal(n, 1, 'from checkpoint 1');
  assert.equal(sim.operation.state, 'active');
  assert.equal(sim.operation.view.kind, 'extract', 'the hostage is still freed');
  assert.equal(sim.hostage.state, 'following');
  assert.equal(f.list.length, 2, 'reinforcements gone');
  assert.equal(f.list[0].dead, true, 'the guard dealt with before the checkpoint stays down');
  assert.equal(f.list[1].dead, false, 'the one after it is back');
  assert.equal(f.list[1].inCombat, false, '... and calm');
  assert.deepEqual(f.soldier.arsenal.ammo()[0], [12, 40], 'the ammo you had at the checkpoint');
  assert.equal(f.health.state.down, false);
  assert.ok(near(f.soldier.state.pos, { x: 20, z: -6 }, 0.6), 'at the checkpoint’s safe spot');
  assert.equal(sim.director.phase, 'calm', 'and a quiet moment to start again');
});

test('retrying with no checkpoint yet starts the mission again from the beginning', async () => {
  const f = await makeFight({ level: yard(RESCUE), god: false });
  f.enemies.options.freeze = true;
  f.health.damage(500);
  f.run(0.1);
  assert.equal(f.sim.operation.state, 'failed');
  assert.equal(f.sim.retry(), null);
  assert.equal(f.sim.operation.state, 'active');
  assert.equal(f.sim.operation.view.phase, 'find');
  assert.equal(f.sim.hostage.state, 'captive');
  assert.ok(near(f.soldier.state.pos, { x: 0, z: 30 }, 0.5), 'back at the start');
});

test('co-op: a teammate who bled out comes back beside a standing friend when the next checkpoint is reached', async () => {
  const { createSim } = await import('../../src/game/sim.js');
  const sim = createSim({ def: yard(RESCUE), players: [{ owner: 0 }, { owner: 1 }], coop: true });
  sim.enemies.options.freeze = true;
  const out = sim.player(1);
  out.health.damage(500);
  out.health.state.bleedLeft = 0.01;
  const tick = (cmd0 = {}) => sim.tick(1 / 60, new Map([[0, { ...cmd0 }], [1, {}]].map(([o, c]) => [o, { ...idle(), ...c }])));
  tick();
  tick();
  assert.equal(out.health.state.dead, true, 'out');
  const respawns = [];
  sim.events.on('player:respawn', (e) => respawns.push(e));
  sim.player(0).soldier.teleport([20, 0, -8.8], Math.PI);
  for (let i = 0; i < 60 * (OBJECTIVES.free + 0.2); i++) tick({ interact: true, yaw: Math.PI });
  assert.equal(sim.operation.checkpoint.n, 1);
  assert.equal(out.health.state.dead, false, 'back in');
  assert.deepEqual(respawns.map((r) => r.owner), [1]);
  assert.ok(near(out.soldier.state.pos, sim.player(0).soldier.state.pos, 3), 'beside their friend');
  sim.dispose();
});

test('best times are kept per mission (and per squad size in co-op)', async () => {
  const records = createRecords(null);
  const { createSim } = await import('../../src/game/sim.js');
  const sim = createSim({ def: yard({ ...RESCUE, stages: [{ kind: 'extract', lz: 'lz', called: true, inbound: 0.5 }] }), records });
  sim.enemies.options.freeze = true;
  sim.player(0).soldier.teleport([0, 0, 22], 0);
  for (let i = 0; i < 60 * (0.5 + HELI.landing + HELI.leaving + 1); i++) sim.tick(1 / 60, idle());
  assert.equal(sim.operation.state, 'complete');
  assert.ok(records.best('test-rescue') > 0);
  sim.dispose();
});

function idle() {
  return { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, jumpHeld: false, crouch: false, crouchPressed: false, sprint: false, fire: false, firePressed: false, ads: false, reload: false, slot: 0, cycle: 0, lastWeapon: false, interact: false, ping: false, grenade: false };
}
