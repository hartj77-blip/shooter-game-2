// Co-op rules: going down, bleeding out, reviving, mission failed and pings
// (docs/lessons/11-how-co-op-works.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../../src/world/physics.js';
import { createSim } from '../../src/game/sim.js';
import { createHealth, DEFAULT_HEALTH } from '../../src/player/health.js';
import { REVIVE } from '../../src/game/revive.js';
import { createEvents } from '../../src/core/events.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import { makeCoop } from '../support/coop.js';
import { enemy } from '../support/ai.js';
import provingGround from '../../levels/proving-ground.js';
import compound from '../../levels/compound.js';

const FLOOR = { type: 'box', size: [80, 1, 80], at: [0, -1, 0], mat: 'ground' };
const arena = (pieces = []) => ({ name: 'arena', spawn: { pos: [0, 0, 0], yaw: 0 }, nav: { min: [-30, -1, -30], max: [30, 4, 30] }, pieces: [FLOOR, ...pieces] });

/** A co-op simulation with `n` players and a log of its events. */
async function squad(n, def = arena()) {
  await initPhysics();
  const events = createEvents();
  const log = [];
  events.onAny((name, data) => log.push({ name, ...data }));
  const sim = createSim({ def, coop: true, events, players: Array.from({ length: n }, (_, owner) => ({ owner })) });
  const run = (seconds, commands = () => new Map()) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) sim.tick(SIM_DT, commands(i));
  };
  return { sim, log, run, p: (o) => sim.player(o) };
}

test('health: solo goes down for good; co-op bleeds out for 30 s, then is dead', () => {
  const solo = createHealth();
  solo.damage(500);
  assert.equal(solo.state.down, true);
  assert.equal(solo.state.bleeding, false, 'solo: no bleeding out (press R to try again)');
  for (let i = 0; i < 60 * 40; i++) solo.update(SIM_DT);
  assert.equal(solo.state.dead, false);

  const events = createEvents();
  const log = [];
  events.onAny((name, data) => log.push(name));
  const coop = createHealth({ revivable: true, events, owner: 2 });
  coop.damage(500);
  assert.equal(coop.state.bleeding, true);
  assert.equal(coop.state.bleedLeft, DEFAULT_HEALTH.bleedOut);
  for (let i = 0; i < 60 * (DEFAULT_HEALTH.bleedOut - 1); i++) coop.update(SIM_DT);
  assert.equal(coop.state.dead, false, 'still hanging on');
  for (let i = 0; i < 60 * 2; i++) coop.update(SIM_DT);
  assert.equal(coop.state.dead, true, 'bled out');
  assert.equal(coop.revive(1), false, 'too late to revive');
  assert.deepEqual(log, ['player:hurt', 'player:down', 'player:dead']);
  coop.reset();
  assert.equal(coop.state.dead, false, 'back for the next fight');
});

test('reviving: hold F next to them for 3 s; they get up on 30 health', async () => {
  const s = await squad(2);
  s.p(1).soldier.teleport([1, 0, 0], 0);
  s.p(1).health.damage(500);
  s.run(0.5);
  assert.equal(s.p(1).health.state.bleeding, true);
  const holdF = () => new Map([[0, { ...idleCommand(0), interact: true }]]);
  s.run(REVIVE.time - 0.5, holdF);
  assert.equal(s.p(1).health.state.bleeding, true, 'not yet');
  assert.ok(s.p(1).view.reviving > 0.7, `the progress shows (${s.p(1).view.reviving.toFixed(2)})`);
  assert.equal(s.p(1).view.reviver, 0);
  s.run(0.6, holdF);
  assert.equal(s.p(1).health.state.down, false, 'back up');
  assert.equal(s.p(1).health.state.hp, DEFAULT_HEALTH.reviveHealth);
  assert.ok(s.log.some((e) => e.name === 'player:revive' && e.owner === 1 && e.by === 0));
});

test('reviving: letting go, or standing too far away, starts it over', async () => {
  const s = await squad(2);
  s.p(1).soldier.teleport([1, 0, 0], 0);
  s.p(1).health.damage(500);
  const holdF = (on) => () => new Map([[0, { ...idleCommand(0), interact: on }]]);
  s.run(2, holdF(true));
  s.run(0.1, holdF(false)); // let go for a moment
  s.run(2, holdF(true));
  assert.equal(s.p(1).health.state.bleeding, true, '2 s + 2 s with a gap is not 3 s');
  s.p(0).soldier.teleport([5, 0, 0], 0); // too far
  s.run(4, holdF(true));
  assert.equal(s.p(1).health.state.bleeding, true, 'out of reach');
});

test('busy hands: holding F stops you shooting (decided from the command alone)', async () => {
  const s = await squad(1);
  s.run(0.5, () => new Map([[0, { ...idleCommand(0), fire: true, firePressed: true, interact: true }]]));
  assert.equal(s.log.filter((e) => e.name === 'weapon:fire').length, 0);
  s.run(0.2, () => new Map([[0, { ...idleCommand(0), fire: true, firePressed: true }]]));
  assert.ok(s.log.some((e) => e.name === 'weapon:fire'), 'let go of F and it fires');
});

test("everyone down is mission failed; downs and revives go on each player's results", async () => {
  const s = await squad(2, arena([enemy('rifleman', [0, 0, -25], { yaw: 0 })]));
  s.sim.enemies.options.freeze = true;
  s.run(0.2, () => new Map([[0, { ...idleCommand(0), moveZ: 1 }]])); // leave the (missing) start area: the fight is on
  assert.equal(s.sim.encounter.state, 'running');
  s.p(1).soldier.teleport([1, 0, 0], 0);
  s.p(1).health.damage(500);
  s.run(REVIVE.time + 0.2, () => new Map([[0, { ...idleCommand(0), interact: true }]]));
  assert.equal(s.sim.encounter.players.get(1).downs, 1);
  assert.equal(s.sim.encounter.players.get(0).revives, 1);
  s.p(0).health.damage(500);
  s.p(1).health.damage(500);
  s.run(0.1);
  assert.equal(s.sim.encounter.state, 'down', 'nobody left standing');
  assert.ok(s.log.some((e) => e.name === 'encounter:down'));
});

test('pings: point at an enemy and they get marked; point at the ground and it is a place', async () => {
  const s = await squad(1, arena([enemy('rifleman', [0, 0, -10], { yaw: Math.PI })]));
  s.sim.enemies.options.freeze = true;
  s.run(0.2);
  const eyeY = s.p(0).soldier.state.pos.y + s.p(0).soldier.body.eyeHeight();
  const atChest = Math.atan2(1.2 - eyeY, 10);
  s.run(SIM_DT, () => new Map([[0, { ...idleCommand(0, atChest), ping: true }]]));
  const first = s.log.find((e) => e.name === 'ping:mark');
  assert.equal(first?.kind, 'enemy');
  assert.equal(first.id, s.sim.enemies.list[0].id);
  s.run(0.5);
  s.run(SIM_DT, () => new Map([[0, { ...idleCommand(Math.PI / 2, -0.6), ping: true }]]));
  const second = s.log.filter((e) => e.name === 'ping:mark')[1];
  assert.equal(second?.kind, 'place');
  assert.ok(Math.abs(second.point.y) < 0.05, 'on the floor');
});

test('over the network: a friend revives a friend, and everyone sees the bleed-out clock and pings', async () => {
  const g = await makeCoop({ def: provingGround, clients: 2, net: { delay: 40, jitter: 10 } });
  g.sim.player(1).soldier.teleport([20, 0, 20], 0);
  g.sim.player(2).soldier.teleport([21, 0, 20], 0);
  g.run(1);
  g.sim.player(1).health.damage(500);
  g.run(1);
  const mirror = g.client(1).local.health.state;
  assert.equal(mirror.bleeding, true, "client 1's own screen knows they're down");
  assert.ok(mirror.bleedLeft > 27 && mirror.bleedLeft < 30, `and how long they have (${mirror.bleedLeft.toFixed(1)} s)`);
  const seen = g.client(2).teammates.list.find((m) => m.owner === 1).view;
  assert.equal(seen.down, true, 'client 2 sees them down');
  g.run(REVIVE.time + 0.5, (slot) => (slot === 2 ? { ...idleCommand(-Math.PI / 2), interact: true } : null));
  assert.equal(g.sim.player(1).health.state.down, false, 'revived on the host');
  g.run(0.3);
  assert.equal(g.client(1).local.health.state.down, false, 'and up again on their own screen');
  assert.ok(g.logs.get(1).some((e) => e.name === 'player:revive' && e.by === 2));
  // A ping from client 2 reaches client 1.
  g.run(SIM_DT * 2, (slot) => (slot === 2 ? { ...idleCommand(0, -0.5), ping: true } : null));
  g.run(0.5);
  assert.ok(g.logs.get(1).some((e) => e.name === 'ping:mark' && e.owner === 2 && e.kind === 'place'));
  g.dispose();
});

test("catching up on a friend's backlog keeps their pings (regression: a ping in the extra command was lost)", async () => {
  const s = await squad(2);
  s.run(0.2);
  // The host takes two of player 2's commands in one tick (net/jitter.js does this after a hiccup).
  s.run(SIM_DT, () => new Map([[1, [{ ...idleCommand(0, -0.5), ping: true }, idleCommand(0, -0.5)]]]));
  assert.ok(s.log.some((e) => e.name === 'ping:mark' && e.owner === 1));
});
