// Missions in co-op: every screen sees the same objectives, hostage and
// helicopter; checkpoint retries put everyone back exactly; snapshots stay small.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCoop } from '../support/coop.js';
import { yard, RESCUE, walkCommand } from '../support/missions.js';
import { OBJECTIVES } from '../../src/game/objectives.js';
import { SNAPSHOT_BUDGET } from '../../src/net/protocol.js';
import { idleCommand } from '../../src/core/input.js';

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test("a client sees the mission as the host does: the stage, its phase, the sites, the hostage", async () => {
  const g = await makeCoop({ def: yard(RESCUE), clients: 1 });
  g.sim.enemies.options.freeze = true;
  g.run(0.5);
  const host = g.sim.operation.view;
  const mine = g.client(1).operation.view;
  for (const k of ['state', 'stage', 'kind', 'phase', 'checkpoint']) assert.equal(mine[k], host[k], k);
  assert.deepEqual(mine.sites, host.sites);
  const h = g.client(1).hostage;
  assert.ok(h, 'the hostage is on the client');
  assert.ok(flat(h.view.pos, g.sim.hostage.pos) < 0.05, 'in the same place');
  assert.equal(h.view.captive, true);
  g.dispose();
});

test('co-op rescue: a friend frees the hostage, who follows them on every screen; nobody gets a correction', async () => {
  const g = await makeCoop({ def: yard(RESCUE), clients: 2 });
  g.sim.enemies.options.freeze = true;
  g.sim.player(1).soldier.teleport([20, 0, -8.9], Math.PI);
  g.sim.player(2).soldier.teleport([-10, 0, 20], 0);
  g.run(1);
  const before = g.clients.map((c) => c.stats.corrections);
  const c1 = g.client(1);
  g.run(OBJECTIVES.free + 0.4, (slot) => (slot === 1 ? { ...idleCommand(Math.PI), interact: true } : null));
  assert.equal(g.sim.hostage.state, 'following', 'freed');
  assert.equal(g.sim.hostage.leader, 1, 'following the friend who freed them');
  g.run(0.3);
  assert.equal(c1.operation.view.kind, 'extract', 'the client moves on too');
  assert.equal(c1.hostage.view.captive, false);
  // Walk off towards the landing zone; the hostage tags along behind (and walks through nobody).
  const goal = { x: 8, z: 14 };
  g.run(8, (slot) => (slot === 1 ? walkCommand(g.sim.player(1), goal) ?? idleCommand(0) : null));
  g.run(2);
  assert.ok(flat(g.sim.hostage.pos, g.sim.player(1).soldier.state.pos) < 5, 'they kept up');
  assert.ok(flat(g.client(2).hostage.view.pos, g.sim.hostage.pos) < 1, 'and the other client sees them there');
  assert.deepEqual(g.clients.map((c) => c.stats.corrections), before, 'no corrections (a follower never blocks you)');
  g.dispose();
});

test('co-op retry from a checkpoint: everyone back at the safe spot, matching the host exactly, with the ammo they had', async () => {
  const g = await makeCoop({ def: yard(RESCUE), clients: 1, net: { delay: 30 } });
  g.sim.enemies.options.freeze = true;
  const c = g.client(1);
  g.sim.player(1).soldier.teleport([20, 0, -8.9], Math.PI);
  g.run(1);
  c.local.soldier.arsenal.load([[9, 33]]);
  g.run(OBJECTIVES.free + 0.4, (slot) => (slot === 1 ? { ...idleCommand(Math.PI), interact: true } : null));
  g.run(0.5);
  assert.equal(g.sim.operation.checkpoint?.n, 1);
  // Spend ammo, then everyone goes down.
  c.local.soldier.arsenal.load([[1, 0]]);
  for (const p of g.sim.team.values()) p.health.damage(500);
  g.run(0.3);
  assert.equal(g.sim.operation.state, 'failed');
  g.host.retry();
  g.run(1);
  assert.equal(g.sim.operation.state, 'active');
  assert.ok(g.gap(1) < 0.01, `the client matches the host (${g.gap(1).toFixed(4)} m)`);
  const spot = g.sim.operation.checkpoint.spots[1].pos;
  assert.ok(flat(c.local.soldier.state.pos, { x: spot[0], z: spot[2] }) < 0.3, 'at the checkpoint');
  assert.deepEqual(c.local.soldier.arsenal.ammo()[0], [9, 33], 'the client put back the ammo it had at the checkpoint');
  assert.equal(c.operation.view.kind, 'extract');
  g.dispose();
});

test('a 4-player mission snapshot, with the most enemies the director allows, the hostage and the mission, fits the budget', async () => {
  const g = await makeCoop({ def: yard(RESCUE), clients: 3 });
  g.sim.enemies.options.freeze = true;
  for (let i = 0; i < 8; i++) g.sim.director.wave({ size: 6 });
  assert.equal(g.sim.enemies.alive.length, g.sim.director.tuning.maxAlive[3], 'as many as allowed');
  let biggest = 0;
  g.client(3).link.onMessage((msg) => { if (msg.t === 'snap') biggest = Math.max(biggest, JSON.stringify(msg).length); });
  g.sim.enemies.options.freeze = false;
  g.run(2);
  assert.ok(biggest > 0);
  assert.ok(biggest <= SNAPSHOT_BUDGET, `${biggest} bytes (budget ${SNAPSHOT_BUDGET})`);
  g.dispose();
});
