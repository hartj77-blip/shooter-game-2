// Co-op networking (docs/lessons/11-how-co-op-works.md and 12-prediction-and-trust.md).
//
// A host and up to three clients in one program, over a pretend network with
// adjustable delay, jitter and packet loss (tests/support/coop.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCoop, wander } from '../support/coop.js';
import { createJitterBuffer } from '../../src/net/jitter.js';
import {
  encodeCommand, decodeCommand, roundCommand, SNAPSHOT_BUDGET, eventFor, wireEvent,
} from '../../src/net/protocol.js';
import { idleCommand } from '../../src/core/input.js';
import provingGround from '../../levels/proving-ground.js';
import compound from '../../levels/compound.js';

const LOSSY = { delay: 60, jitter: 30, loss: 0.08 };
/** Friends 1 and 2 head off in opposite directions (so they never bump into each other). */
const apart = (def) => (slot, i) => (slot === 0 ? null : wander(def.spawn.yaw + (slot === 1 ? -1 : 1) * Math.PI / 2)(slot, i));

/** The command that aims from `eye` at `point`. */
function aimAt(eye, point, extra = {}) {
  const dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z;
  return { ...idleCommand(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))), ...extra };
}
const eyeOf = (soldier) => ({ x: soldier.state.pos.x, y: soldier.state.pos.y + soldier.body.eyeHeight(), z: soldier.state.pos.z });

// ------------------------------------------------------------------ the pieces

test('commands survive the trip: encode then decode gives the same command', () => {
  const cmd = { ...idleCommand(1.23456, -0.321), moveX: -1, moveZ: 1, jump: true, sprint: true, fire: true, slot: 3, cycle: -1, interact: true };
  const [seq, back] = decodeCommand(JSON.parse(JSON.stringify(encodeCommand(42, cmd))));
  assert.equal(seq, 42);
  for (const k of ['moveX', 'moveZ', 'jump', 'sprint', 'fire', 'slot', 'cycle', 'interact', 'crouch', 'ads']) assert.equal(back[k], cmd[k] ?? false, k);
  assert.ok(Math.abs(back.yaw - cmd.yaw) <= 0.00005 && Math.abs(back.pitch - cmd.pitch) <= 0.00005, 'aim to a tenth of a milliradian');
  // Rounding twice changes nothing: the client predicts with exactly what the host will decode.
  assert.deepEqual(roundCommand(roundCommand(cmd)), roundCommand(cmd));
});

test('the jitter buffer: waits for a cushion, ignores repeats, guesses without repeating presses, catches up', () => {
  const jb = createJitterBuffer({ target: 2, max: 6 });
  const cmd = (n, extra = {}) => ({ ...idleCommand(n / 100), moveZ: 1, ...extra });
  jb.push(1, cmd(1));
  assert.deepEqual(jb.take(), [], 'one waiting is not a cushion yet');
  jb.push(2, cmd(2, { jump: true }));
  jb.push(1, cmd(1)); // the same command again (redundant copy): ignored
  assert.equal(jb.size, 2);
  assert.equal(jb.take()[0].yaw, 0.01);
  assert.equal(jb.take()[0].jump, true);
  assert.equal(jb.ack, 2);
  const [guess] = jb.take(); // nothing waiting
  assert.equal(guess.moveZ, 1, 'keeps walking');
  assert.equal(guess.jump, false, 'but does not jump again');
  assert.equal(jb.ack, 2, 'a guess is not acknowledged');
  // A burst after a hiccup: 9 arrive at once (out of order, too).
  for (const n of [5, 3, 4, 6, 7, 8, 9, 10, 11]) jb.push(n, cmd(n));
  assert.equal(jb.take().length, 2, 'too far behind: two at a time');
  assert.equal(jb.ack, 4);
  jb.push(4, cmd(4)); // late copy of an old one
  assert.equal(jb.size, 7);
});

test('events: who gets told what, and nothing but plain data crosses the wire', () => {
  const enemy = { id: 'e3', kind: 'enemy', soldier: {}, colliders: [] };
  assert.equal(eventFor('weapon:fire', { owner: 1 }, 1), false, 'your own shots are not echoed back');
  assert.equal(eventFor('weapon:fire', { owner: 'e3' }, 1), true);
  assert.equal(eventFor('player:hurt', { owner: 2 }, 1), false, "someone else's damage is theirs");
  assert.equal(eventFor('player:hurt', { owner: 1 }, 1), true);
  assert.equal(eventFor('player:land', { owner: 0 }, 1), false, 'body feedback stays local');
  assert.equal(eventFor('encounter:finish', {}, 1), true);
  const [, data] = wireEvent('target:hit', { owner: 1, target: enemy, enemy, damage: 30 });
  assert.deepEqual(data, { owner: 1, target: { id: 'e3', kind: 'enemy' }, damage: 30 });
});

// ------------------------------------------------------------------ prediction and reconciliation

test('a perfect network: a client predicts exactly what the host decides (no corrections)', async () => {
  const g = await makeCoop({ def: provingGround, clients: 2 });
  g.run(1); // settle (landing at spawn can need one fix-up before the first command)
  const before = g.clients.map((c) => c.stats.corrections);
  g.run(6, apart(provingGround));
  assert.deepEqual(g.clients.map((c) => c.stats.corrections), before, 'no corrections while running, jumping and crouching');
  g.run(0.5);
  assert.ok(g.gap(1) < 0.01 && g.gap(2) < 0.01, `host and clients agree (${g.gap(1).toFixed(4)}, ${g.gap(2).toFixed(4)} m)`);
  g.dispose();
});

test('a bad network (60 ms each way, jitter, 8% loss): corrections are rare and small, and everyone ends up agreeing', async () => {
  const g = await makeCoop({ def: compound, clients: 2, net: LOSSY });
  g.sim.enemies.options.freeze = true;
  g.run(1);
  g.run(6, apart(compound));
  g.run(1);
  for (const c of g.clients) {
    assert.ok(c.stats.corrections <= 8, `client ${c.me}: ${c.stats.corrections} corrections in 8 s`);
    assert.ok(c.stats.bigCorrection < 0.5, `client ${c.me}: biggest correction ${c.stats.bigCorrection.toFixed(2)} m`);
  }
  assert.ok(g.gap(1) < 0.01 && g.gap(2) < 0.01, `host and clients agree (${g.gap(1).toFixed(4)}, ${g.gap(2).toFixed(4)} m)`);
  assert.ok(g.net.lost > 0, 'some packets really were lost');
  g.dispose();
});

test('when the host moves you (a teleport), your browser follows within one snapshot', async () => {
  const g = await makeCoop({ def: provingGround, clients: 1, net: { delay: 40 } });
  g.run(1);
  g.sim.player(1).soldier.teleport([20, 0, 5], 0);
  g.run(0.25); // 40 ms there, a snapshot every 50 ms
  assert.ok(g.gap(1) < 0.05, `caught up (${g.gap(1).toFixed(3)} m)`);
  g.dispose();
});

test('others move smoothly: a teammate walking straight never steps backwards on your screen', async () => {
  const g = await makeCoop({ def: provingGround, clients: 2, net: LOSSY });
  g.run(1);
  const yaw = provingGround.spawn.yaw - Math.PI / 2;
  const seen = [];
  g.run(4, (slot) => (slot === 1 ? { ...idleCommand(yaw), moveZ: 1 } : null), () => {
    const p = g.client(2).teammates.list.find((m) => m.owner === 1);
    if (p) seen.push({ ...p.view.pos });
  });
  // Walking along +X (yaw = -90° from the spawn's facing), so x should only ever grow.
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  let backwards = 0;
  let moved = 0;
  for (let i = 1; i < seen.length; i++) {
    const step = (seen[i].x - seen[i - 1].x) * forward.x + (seen[i].z - seen[i - 1].z) * forward.z;
    if (step < -1e-6) backwards++;
    moved += step;
  }
  assert.equal(backwards, 0, 'never backwards');
  assert.ok(moved > 10, `it really walked (${moved.toFixed(1)} m)`);
  g.dispose();
});

// ------------------------------------------------------------------ the fight

test("favour the shooter: a client's shots kill an enemy on the host, and everyone sees it go down", async () => {
  const g = await makeCoop({ def: compound, clients: 2, net: { delay: 50, jitter: 10 } });
  const guard = g.sim.enemies.list[0];
  g.sim.enemies.options.freeze = true;
  g.sim.player(1).health.godMode = true;
  g.sim.player(1).soldier.teleport([guard.pos.x, 0, guard.pos.z + 4], 0);
  g.run(1); // the client catches up with the teleport, and sees the guard
  const c = g.client(1);
  const proxy = c.enemies.list[0];
  const chest = () => ({ x: proxy.view.pos.x, y: proxy.view.pos.y + 1.2, z: proxy.view.pos.z });
  g.run(1, (slot) => (slot === 1 ? aimAt(eyeOf(c.local.soldier), chest(), { fire: true }) : null));
  g.run(0.5);
  assert.equal(guard.dead, true, 'dead on the host');
  assert.ok(g.hostLog.some((e) => e.name === 'target:hit' && e.owner === 1 && e.kind === 'enemy'), 'the host credits player 2');
  assert.equal(g.sim.encounter.players.get(1)?.kills, 1, 'their kill, on their results card');
  for (const slot of [1, 2]) {
    assert.ok(g.logs.get(slot).some((e) => e.name === 'enemy:down' && e.id === guard.id), `client ${slot} heard it go down`);
    assert.equal(g.client(slot).enemies.list[0].view.dead, true, `client ${slot} shows it dead`);
  }
  assert.ok(g.logs.get(2).some((e) => e.name === 'weapon:fire' && e.owner === 1), 'client 2 saw (and heard) client 1 shooting');
  const shots = (log) => log.filter((e) => e.name === 'weapon:fire' && e.owner === 1).length;
  assert.equal(shots(g.logs.get(1)), shots(g.hostLog), 'client 1 heard each of its own shots once (no echo from the host)');
  g.dispose();
});

test('the host checks claims: impossible damage is capped, and dead or faraway shooters are ignored', async () => {
  const g = await makeCoop({ def: compound, clients: 1 });
  g.sim.enemies.options.freeze = true;
  g.run(0.5);
  const [a, b] = g.sim.enemies.list;
  const me = g.sim.player(1).soldier.state.pos;
  const origin = { x: me.x, y: me.y + 1.6, z: me.z };
  const shot = (id, damage, from = origin) => g.client(1).link.send({
    t: 'fire', w: 'carbine', origin: from, pulls: 1, shots: [{ end: a.pos, tracer: false }],
    hits: [{ id, damage, zone: 'body', point: a.pos, dir: { x: 0, y: 0, z: -1 }, distance: 10 }],
  });
  shot(a.id, 100000);
  g.run(0.2);
  assert.equal(a.dead, false, 'one carbine bullet cannot do 100,000 damage');
  assert.ok(a.health < a.maxHealth, 'but a real hit still counts');
  shot(b.id, 30, { x: origin.x + 50, y: origin.y, z: origin.z });
  g.run(0.2);
  assert.equal(b.health, b.maxHealth, 'a shot that starts 50 m from you is ignored');
  g.dispose();
});

test('enemy fire hurts the player it hit, and only that player hears about it', async () => {
  const g = await makeCoop({ def: compound, clients: 2, net: { delay: 40, jitter: 10 } });
  const guard = g.sim.enemies.list[0];
  g.sim.player(1).soldier.teleport([guard.pos.x, 0, guard.pos.z + 9], 0); // client 1: in plain view of the gate
  let lowest = 100;
  g.run(10, () => null, () => { lowest = Math.min(lowest, g.client(1).local.health.state.hp); });
  assert.ok(g.sim.player(1).health.state.taken > 0, 'player 2 (client 1) got shot');
  assert.equal(g.sim.player(2).health.state.taken, 0, 'player 3, out of sight at the start, did not');
  assert.ok(g.logs.get(1).some((e) => e.name === 'player:hurt' && e.owner === 1), 'client 1 was told');
  assert.ok(!g.logs.get(2).some((e) => e.name === 'player:hurt'), "client 2 wasn't told about someone else's wounds");
  assert.ok(lowest < 100, "client 1's health bar went down");
  g.dispose();
});

test('friendly fire is off: bullets pass through teammates', async () => {
  const g = await makeCoop({ def: provingGround, clients: 2 });
  g.sim.player(1).soldier.teleport([30, 0, 30], Math.PI / 2);
  g.sim.player(2).soldier.teleport([25, 0, 30], -Math.PI / 2);
  g.run(1);
  const shooter = g.client(1);
  const mate = () => shooter.teammates.list.find((m) => m.owner === 2).view.pos;
  g.run(1, (slot) => (slot === 1 ? aimAt(eyeOf(shooter.local.soldier), { ...mate(), y: mate().y + 1.2 }, { fire: true }) : null));
  g.run(0.3);
  assert.ok(g.hostLog.some((e) => e.name === 'weapon:fire' && e.owner === 1), 'they did fire');
  assert.equal(g.sim.player(2).health.state.taken, 0, 'nobody got hurt');
  assert.ok(!g.hostLog.some((e) => e.name === 'target:hit' && e.kind === 'player'));
  g.dispose();
});

// ------------------------------------------------------------------ coming and going

test('joining a game in progress: the newcomer sees the world as it is', async () => {
  const g = await makeCoop({ def: compound, clients: 1 });
  g.sim.enemies.options.freeze = true;
  g.run(0.5);
  const victim = g.sim.enemies.list[3];
  g.sim.enemies.damage(victim, 1000, { owner: 0, zone: 'body', from: victim.pos });
  g.run(1);
  const late = await g.join(2);
  g.run(0.5);
  // (Stand-ins are made when snapshots mention someone, and the fallen leave snapshots after a second.)
  assert.ok(!late.enemies.list.some((p) => p.id === victim.id && !p.view.dead), 'the enemy that died before they came never stands up for them');
  assert.equal(late.enemies.list.length, 15, 'they see everyone still standing');
  assert.equal(late.encounter.remaining, 15);
  assert.ok(late.teammates.list.some((m) => m.owner === 1), 'they see the other client');
  assert.ok(g.client(1).teammates.list.some((m) => m.owner === 2), 'and the other client sees them');
  g.dispose();
});

test("someone leaving: they're removed for everyone, and enemies stop chasing them", async () => {
  const g = await makeCoop({ def: compound, clients: 2, net: { delay: 30 } });
  g.run(1);
  g.client(1).link.close();
  g.run(0.5);
  assert.equal(g.sim.player(1), null, 'gone from the host');
  assert.ok(!g.sim.enemies.players.some((p) => p.owner === 1), "gone from the enemies' list");
  assert.ok(!g.client(2).teammates.list.some((m) => m.owner === 1), 'gone from the other screen');
  assert.ok(g.logs.get(2).some((e) => e.name === 'player:left' && e.owner === 1));
  g.dispose();
});

test('the host restarts: everyone is put back at the start', async () => {
  const g = await makeCoop({ def: provingGround, clients: 1, net: { delay: 30 } });
  g.run(2, apart(provingGround));
  // (While running, your own screen is ahead of the host by the travel time: that's prediction.)
  g.host.restart();
  g.run(0.5);
  const [x, , z] = g.sim.player(1).spawn.pos;
  const p = g.client(1).local.soldier.state.pos;
  // (Commands already on their way when the host restarted still count: a step or two.)
  assert.ok(Math.hypot(p.x - x, p.z - z) < 0.5, 'back at their spawn on their own screen');
  assert.ok(g.gap(1) < 0.01);
  g.dispose();
});

test('restart ghost: news from before a restart never knocks over the new enemy (regression)', async () => {
  // The bug: an "enemy down" still waiting to be shown (events play 0.1 s behind,
  // in step with the stand-ins) played after the host restarted, and hid the
  // brand-new enemy with the same name.
  const g = await makeCoop({ def: compound, clients: 1, net: { delay: 40 } });
  g.sim.enemies.options.freeze = true;
  g.run(1);
  const victim = g.sim.enemies.list[2];
  g.sim.enemies.damage(victim, 1000, { owner: 0, zone: 'body', from: victim.pos });
  g.run(0.1); // the news has reached the client, and waits its turn
  g.host.restart();
  g.run(1);
  const log = g.logs.get(1);
  const at = log.findIndex((e) => e.name === 'mission:restart');
  assert.ok(at >= 0, 'the client heard about the restart');
  assert.ok(!log.slice(at).some((e) => e.name === 'enemy:down'), 'no stale "enemy down" after it');
  const p = g.client(1).enemies.list.find((x) => x.id === victim.id);
  assert.ok(p && !p.view.dead, 'the new enemy with that name is standing on the client');
  assert.equal(g.client(1).enemies.list.length, 16);
  g.dispose();
});

test('a fallen enemy leaves the snapshots a moment later (long missions stay small), and stays down on screen', async () => {
  const g = await makeCoop({ def: compound, clients: 1 });
  g.sim.enemies.options.freeze = true;
  g.run(0.5);
  const victim = g.sim.enemies.list[5];
  let last = null;
  g.client(1).link.onMessage((msg) => { if (msg.t === 'snap') last = msg; });
  g.sim.enemies.damage(victim, 1000, { owner: 0, zone: 'body', from: victim.pos });
  g.run(0.3);
  assert.ok(last.e.some((row) => row[0] === 5), 'still there just after falling (so everyone sees it fall)');
  g.run(1.5);
  assert.ok(!last.e.some((row) => row[0] === 5), 'gone a second later');
  assert.equal(last.e.length, 15);
  const p = g.client(1).enemies.list.find((x) => x.id === victim.id);
  assert.equal(p.view.dead, true, 'and the client still shows it dead');
  g.dispose();
});

test('enemy rows are matched by number: out of order, missing or new, each finds its own stand-in', async () => {
  await import('../../src/world/physics.js').then((m) => m.initPhysics());
  const { createClient } = await import('../../src/net/client.js');
  const { encodeEnemy, encodePlayer } = await import('../../src/net/protocol.js');
  let deliver = null;
  const link = { onMessage(fn) { deliver = fn; return () => {}; }, send() {} };
  const client = createClient({ def: compound, me: 1, link });
  const row = (index, role, x) => encodeEnemy(index, {
    role, pos: { x, y: 0, z: 0 }, yaw: 0, pitch: 0, speed: 0, alert: 'calm', awareness: 0, target: null, laserCharge: 0,
  }, 100);
  const me = encodePlayer({ owner: 1, pos: { x: 0, y: 0, z: 30 }, yaw: 0, pitch: 0, speed: 0, weapon: 'carbine', hp: 100 });
  const snap = (tick, e) => deliver({ t: 'snap', tick, p: [me], e, g: [], enc: null, ack: 0, buf: 2 });
  // Number 20 is beyond the level's own 16: a reinforcement, a Rusher.
  for (let t = 3; t <= 60; t += 3) snap(t, [row(20, 'rusher', 7), row(4, 'marksman', 4), row(0, 'rifleman', 1)]);
  for (let i = 0; i < 20; i++) client.step(1 / 60, idleCommand(0));
  const byId = new Map(client.enemies.list.map((p) => [p.id, p]));
  assert.deepEqual(client.enemies.list.map((p) => p.index), [0, 4, 20], 'sorted by number, only the ones mentioned');
  assert.equal(byId.get('e20').role, 'rusher');
  assert.equal(byId.get('e20').view.weapon, 'smg', 'armed like a Rusher');
  assert.ok(Math.abs(byId.get(client.enemies.list[1].id).view.pos.x - 4) < 1e-6, 'number 4 is where row 4 says');
  client.dispose();
});

// ------------------------------------------------------------------ cost

test('a 4-player Compound snapshot fits the size budget', async () => {
  const g = await makeCoop({ def: compound, clients: 3 });
  let biggest = 0;
  g.client(3).link.onMessage((msg) => { if (msg.t === 'snap') biggest = Math.max(biggest, JSON.stringify(msg).length); });
  g.run(2, apart(compound));
  assert.ok(biggest > 0);
  assert.ok(biggest <= SNAPSHOT_BUDGET, `${biggest} bytes (budget ${SNAPSHOT_BUDGET})`);
  g.dispose();
});

test('loadouts: a friend with a bigger magazine is built with it on the host, and nobody gets a correction', async () => {
  const kit = [{ id: 'carbine', attachments: { mag: 'extended', under: 'foregrip' } }, 'pistol'];
  const g = await makeCoop({ def: provingGround, clients: 2, loadouts: { 1: kit } });
  const onHost = g.sim.player(1).soldier.arsenal;
  const mine = g.client(1).local.soldier.arsenal;
  assert.deepEqual(onHost.guns.map((x) => x.def.id), ['carbine', 'pistol'], 'the host builds their guns, not the default four');
  assert.equal(onHost.current.def.mag, 45);
  assert.equal(mine.current.def.mag, 45);
  assert.equal(g.sim.player(2).soldier.arsenal.guns.length, 4, 'friend 2 sent nothing: the default');
  g.run(1);
  const before = g.clients.map((c) => c.stats.corrections);
  // Friend 1 holds the trigger past where a normal magazine would run dry, while walking.
  g.run(3.2, (slot, i) => (slot === 1 ? { ...wander(provingGround.spawn.yaw - Math.PI / 2)(slot, i), fire: true, firePressed: i === 0 } : null));
  g.run(0.5);
  assert.ok(mine.current.mag < 15 && mine.current.status !== 'reloading', `fired past 30 without reloading (mag ${mine.current.mag})`);
  assert.equal(onHost.current.mag, mine.current.mag, 'the host counted the same rounds');
  assert.deepEqual(g.clients.map((c) => c.stats.corrections), before, 'no corrections');
  g.dispose();
});
