// Ammo, crates and hold-to-interact (docs/lessons/17-supplies-grenades-and-escorts.md).
//
// In a mission your spare ammo is real. Ammo crates fill it up again (hold F
// for a second), a few times each, shared by the squad. In co-op your browser
// keeps its own ammo count; the host decides when a crate refill happens.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../../src/world/physics.js';
import { createSim } from '../../src/game/sim.js';
import { SUPPLY } from '../../src/game/supply.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';
import { makeCoop } from '../support/coop.js';
import { FLOOR } from '../support/sim.js';
import provingGround from '../../levels/proving-ground.js';

/** A tiny mission map: a floor and one ammo crate just north of the spawn. */
const YARD = {
  name: 'Test yard', spawn: { pos: [0, 0, 0], yaw: 0 }, sun: { azimuth: 0, elevation: 1 },
  nav: { min: [-20, -20], max: [20, 20] },
  mission: { id: 'test' },
  pieces: [FLOOR, { type: 'crate', at: [0, 0, -2.4], refills: 2 }],
};

async function yard(players = [{ owner: 0 }], def = YARD) {
  await initPhysics();
  const sim = createSim({ def, players });
  sim.player(0).soldier.teleport([0, 0, -1.2], 0); // right by the crate
  const run = (seconds, make = () => ({})) => {
    for (let i = 0, n = Math.round(seconds / SIM_DT); i < n; i++) {
      const cmds = new Map([...sim.team.values()].map((p) => [p.owner, { ...idleCommand(p.soldier.state.yaw), ...make(p.owner, i) }]));
      sim.tick(SIM_DT, cmds);
    }
  };
  return { sim, run, gun: (owner = 0) => sim.player(owner).soldier.arsenal.current };
}

test('practice maps keep infinite ammo; in a mission the spare ammo runs out', async () => {
  await initPhysics();
  const practice = createSim({ def: provingGround });
  assert.equal(practice.infiniteAmmo, true);
  practice.dispose();
  const { sim, run, gun } = await yard();
  assert.equal(sim.infiniteAmmo, false);
  sim.player(0).soldier.arsenal.load([[5, 10]]);
  run(7, (owner, i) => ({ fire: true, firePressed: i % 10 === 0 })); // (an empty gun reloads when you pull the trigger)
  assert.equal(gun().mag, 0, 'magazine empty');
  assert.equal(gun().reserve, 0, 'and nothing left to reload with');
  sim.dispose();
});

test('an ammo crate: hold F for a second and your spare ammo is full again; it has a few refills, then it is empty', async () => {
  const { sim, run } = await yard();
  const me = sim.player(0);
  me.soldier.arsenal.load([[30, 3], [32, 0], [6, 1], [15, 2]]);
  run(SUPPLY.useTime * 0.6, () => ({ interact: true }));
  assert.ok(me.useProgress > 0.4 && me.using === 'crate', 'the ring is filling');
  assert.equal(me.soldier.arsenal.guns[0].reserve, 3, 'nothing yet');
  run(SUPPLY.useTime * 0.6, () => ({ interact: true }));
  assert.deepEqual(me.soldier.arsenal.ammo(), [[30, 120], [32, 160], [6, 36], [15, 60]], 'every gun’s spares are full; magazines untouched');
  assert.equal(sim.supply.list[0].left, 1, 'one refill used');
  // Still holding F: nothing more (let go first), and a full soldier can't waste one anyway.
  run(2, () => ({ interact: true }));
  assert.equal(sim.supply.list[0].left, 1);
  me.soldier.arsenal.load([[30, 0]]);
  run(0.2);
  run(SUPPLY.useTime + 0.1, () => ({ interact: true }));
  assert.equal(sim.supply.list[0].left, 0, 'the last refill');
  me.soldier.arsenal.load([[30, 0]]);
  run(0.2);
  run(SUPPLY.useTime + 0.1, () => ({ interact: true }));
  assert.equal(me.soldier.arsenal.guns[0].reserve, 0, 'an empty crate gives nothing');
  sim.dispose();
});

test('letting go of F starts it again from nothing; your hands are busy while you hold it', async () => {
  const { sim, run } = await yard();
  const me = sim.player(0);
  me.soldier.arsenal.load([[30, 0]]);
  run(0.6, () => ({ interact: true }));
  run(0.1);
  run(0.6, () => ({ interact: true }));
  assert.equal(me.soldier.arsenal.guns[0].reserve, 0, 'two short holds are not one long one');
  let fired = 0;
  sim.events.on('weapon:fire', () => fired++);
  run(0.3, () => ({ interact: true, fire: true, firePressed: true }));
  assert.equal(fired, 0, 'no shooting while you hold F');
  sim.dispose();
});

test('a downed teammate comes first: holding F beside them and a crate revives them, the crate waits', async () => {
  // (Co-op rules: teammates bleed out and can be revived.)
  await initPhysics();
  const coop = createSim({ def: YARD, players: [{ owner: 0 }, { owner: 1 }], coop: true });
  const helper = coop.player(0), hurt = coop.player(1);
  helper.soldier.arsenal.load([[30, 0]]);
  hurt.soldier.teleport([0.8, 0, -1.2], 0);
  helper.soldier.teleport([0, 0, -1.2], 0);
  hurt.health.damage(500);
  const tick = (cmd0) => coop.tick(SIM_DT, new Map([[0, { ...idleCommand(0), ...cmd0 }], [1, idleCommand(0)]]));
  for (let i = 0; i < 60 * 3.2; i++) tick({ interact: true });
  assert.equal(hurt.health.state.bleeding, false, 'back up');
  assert.equal(helper.soldier.arsenal.guns[0].reserve, 0, 'the crate was not used meanwhile');
  assert.equal(coop.supply.list[0].left, 2);
  coop.dispose();
});

test('co-op, perfect network: firing until empty, reloading and resupplying cause no corrections, and both copies agree', async () => {
  const g = await makeCoop({ def: YARD, clients: 1 });
  const c = g.client(1);
  g.sim.player(1).soldier.teleport([0, 0, -1.5], 0);
  g.sim.player(0).soldier.teleport([6, 0, 6], 0); // out of the way (bumping into people is the one expected cause, lesson 12)
  g.run(1);
  const before = c.stats.corrections;
  // Low on ammo, on both computers (as a checkpoint would leave you).
  g.sim.player(1).soldier.arsenal.load([[4, 8]]);
  c.local.soldier.arsenal.load([[4, 8]]);
  g.run(5, (slot, i) => (slot === 1 ? { ...idleCommand(0), fire: true, firePressed: i % 8 === 0, moveX: (i % 120 < 30 || i % 120 >= 90) ? 0.5 : -0.5 } : null));
  assert.equal(c.local.soldier.arsenal.current.reserve, 0, 'shot dry');
  g.run(2, (slot) => (slot === 1 ? { ...idleCommand(0), interact: true } : null));
  g.run(0.5);
  assert.equal(c.local.soldier.arsenal.current.reserve, 120, 'the client filled its own guns');
  assert.deepEqual(g.sim.player(1).soldier.arsenal.ammo(), c.local.soldier.arsenal.ammo(), "the host's copy agrees");
  assert.equal(c.supply.list[0].left, 1, 'the client knows the crate has one refill left');
  g.run(3, (slot, i) => (slot === 1 ? { ...idleCommand(0), fire: true, reload: i === 100, moveZ: i % 90 < 45 ? 0.4 : -0.4 } : null));
  assert.equal(c.stats.corrections - before, 0, 'not a single correction');
  g.dispose();
});

test('the host checks ammo loosely: nobody fires more than a full load (plus a spare magazine) between refills', async () => {
  const g = await makeCoop({ def: YARD, clients: 1 });
  g.run(0.5);
  const me = g.sim.player(1).soldier.state.pos;
  const origin = { x: me.x, y: me.y + 1.6, z: me.z };
  let heard = 0;
  g.sim.events.on('weapon:fire', (e) => { if (e.owner === 1) heard++; });
  for (let i = 0; i < 200; i++) {
    g.client(1).link.send({ t: 'fire', w: 'carbine', origin, pulls: 1, shots: [{ end: { x: 0, y: 1, z: -30 }, tracer: false }], hits: [] });
    if (i % 20 === 0) g.run(0.05);
  }
  g.run(0.2);
  assert.equal(heard, 30 * 2 + 120, 'the claims beyond a full load were ignored');
  g.dispose();
});
