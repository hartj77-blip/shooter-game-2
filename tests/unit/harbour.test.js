// The Harbour (levels/harbour.js) and its missions (levels/missions.js):
// everything a mission needs can be reached, the start is out of sight, and
// the map is quick enough to map for the enemies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFight } from '../support/ai.js';
import { makeCoop } from '../support/coop.js';
import { findPath, route } from '../../src/ai/astar.js';
void findPath;
import { RAPIER, initPhysics } from '../../src/world/physics.js';
import { SIGHT } from '../../src/world/groups.js';
import { createSim } from '../../src/game/sim.js';
import { SNAPSHOT_BUDGET } from '../../src/net/protocol.js';
import harbour from '../../levels/harbour.js';
import { MISSIONS, missionLevels } from '../../levels/missions.js';

const rescue = { ...harbour, mission: MISSIONS[0] };
let shared = null;
const fight = async () => (shared ??= await makeFight({ level: rescue, god: true }));
const pt = (at) => ({ x: at[0], y: at[1] ?? 0, z: at[2] });

test('the Harbour builds, and mapping it for the enemies takes a few seconds at most', async () => {
  await initPhysics();
  const started = performance.now();
  const sim = createSim({ def: rescue, seed: 2 });
  const took = (performance.now() - started) / 1000;
  assert.ok(sim.nav.count > 50000, `${sim.nav.count} walkable cells`);
  assert.ok(took < 8, `built and mapped in ${took.toFixed(2)} s`);
  assert.equal(sim.enemies.list.length, 16, 'the garrison');
  assert.equal(sim.level.expanded.lzs.length, 2);
  assert.ok(sim.level.expanded.crates.length >= 6, 'ammo crates around the map');
  sim.dispose();
});

test('everything a mission needs can be reached on foot from where you start', async () => {
  const f = await fight();
  const from = f.nav.nearest(pt(harbour.spawn.pos));
  assert.ok(from >= 0);
  assert.equal(f.nav.component[from], f.nav.main, 'you start on the main part of the map');
  // (On a map this big, "can I walk there?" is best asked as "is it on the same
  // connected piece of map (island) as the start?": a route search from one
  // corner to the other would give up first, lesson 16.)
  const reach = (p, what) => {
    const c = f.nav.nearest(p, { radius: 1.5, anyIsland: true });
    assert.ok(c >= 0, `${what} has somewhere to stand (${p.x}, ${p.y}, ${p.z})`);
    assert.ok(Math.abs(f.nav.Y[c] - p.y) < 0.4, `${what} is mapped at the right height`);
    assert.equal(f.nav.component[c], f.nav.main, `${what} can be reached`);
  };
  const ex = f.sim.level.expanded;
  for (const e of f.list) for (const p of [e.spawn.pos, ...e.patrol]) reach(p, `${e.id} (${e.role})`);
  for (const s of ex.sites) {
    reach(pt(s.at), `site ${s.id}`);
    if (s.safe) reach({ x: s.safe[0], y: s.safe[3] ?? 0, z: s.safe[1] }, `site ${s.id}'s safe spot`);
  }
  for (const c of ex.crates) reach({ x: c.at[0], y: 0, z: c.at[2] + 1 }, 'a crate');
  for (const lz of ex.lzs) {
    reach(pt(lz.at), `landing zone ${lz.id}`);
    if (lz.safe) reach({ x: lz.safe[0], y: lz.safe[3] ?? 0, z: lz.safe[1] }, `${lz.id}'s safe spot`);
    reach({ x: lz.radio[0], y: lz.at[1] ?? 0, z: lz.radio[1] }, `${lz.id}'s radio`);
  }
});

test("reinforcements' routes start and end on the map, joined to everything else", async () => {
  const f = await fight();
  for (const e of f.sim.level.expanded.entries) {
    const points = [pt(e.at), ...e.route.map(([x, z, y = 0]) => ({ x, y, z }))];
    for (let i = 0; i < points.length - 1; i++) {
      assert.ok(route(f.nav, points[i], points[i + 1]), `${e.id}: leg ${i + 1} can be walked`);
    }
    const from = f.nav.nearest(points[0]);
    assert.equal(f.nav.component[from], f.nav.main, `${e.id} is on the main part of the map`);
  }
});

test('the hostage can walk from every place they might be held to the helicopter', async () => {
  const f = await fight();
  const lz = f.sim.level.expanded.lzs.find((l) => l.id === 'lz');
  for (const id of MISSIONS[0].stages[0].sites) {
    const s = f.sim.level.expanded.sites.find((x) => x.id === id);
    assert.ok(route(f.nav, pt(s.at), pt(lz.at)), `from the ${id}`);
  }
});

test('fair start: nobody can see where you arrive, even after a while', async () => {
  const f = await makeFight({ level: { ...rescue, mission: { ...MISSIONS[0], director: { calm: 9999 } } }, god: true });
  const [sx, , sz] = harbour.spawn.pos;
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  for (const e of f.list) {
    const eye = e.eye();
    for (const y of [1.1, 1.6]) {
      const d = { x: sx - eye.x, y: y - eye.y, z: sz - eye.z };
      const len = Math.hypot(d.x, d.y, d.z);
      ray.origin = eye;
      ray.dir = { x: d.x / len, y: d.y / len, z: d.z / len };
      assert.ok(len > e.def.sight.range || f.world.castRay(ray, len, true, undefined, SIGHT), `${e.id} (${e.role}) can't see the start`);
    }
  }
  f.run(8);
  for (const e of f.list) assert.ok(!e.inCombat && e.senses.awareness < 0.35, `${e.id} still calm`);
});

test('every mission plays on the Harbour: its sites exist, and its first objective starts', async () => {
  await initPhysics();
  const levels = missionLevels({ harbour });
  assert.deepEqual(Object.keys(levels), [...MISSIONS.map((m) => m.id), ...MISSIONS.map((m) => `${m.id}-night`)]);
  for (const [id, def] of Object.entries(levels)) {
    const sim = createSim({ def, id, seed: 9 });
    assert.equal(sim.operation.state, 'active', id);
    assert.equal(sim.operation.view.kind, def.mission.stages[0].kind, `${id} starts with its first stage`);
    if (def.mission.stages[0].kind === 'rescue') assert.ok(sim.hostage, 'a hostage to rescue');
    sim.dispose();
  }
});

test('a 4-player Harbour snapshot at the enemy cap fits the size budget', async () => {
  const g = await makeCoop({ def: rescue, clients: 3 });
  g.sim.enemies.options.freeze = true;
  for (let i = 0; i < 6; i++) g.sim.director.wave({ size: 6 });
  let biggest = 0;
  g.client(3).link.onMessage((msg) => { if (msg.t === 'snap') biggest = Math.max(biggest, JSON.stringify(msg).length); });
  g.sim.enemies.options.freeze = false;
  g.run(1.5);
  assert.ok(biggest > 0 && biggest <= SNAPSHOT_BUDGET, `${biggest} bytes with ${g.sim.enemies.alive.length} enemies (budget ${SNAPSHOT_BUDGET})`);
  g.dispose();
});

test('Kingpin (eliminate): at every candidate site the officer and guards stand somewhere reachable; downing him ends the stage; a retry brings him back', async () => {
  const mission = MISSIONS.find((m) => m.id === 'harbour-eliminate');
  for (const siteId of mission.stages[0].sites) {
    const def = { ...harbour, mission: { ...mission, stages: [{ ...mission.stages[0], sites: [siteId] }, mission.stages[1]] } };
    const f = await makeFight({ level: def, god: true, seed: 4 });
    f.enemies.options.freeze = true;
    f.run(0.2);
    const officer = f.list.find((e) => e.hvt);
    assert.ok(officer, `${siteId}: an officer`);
    assert.ok(officer.health > 200, 'tougher than a rifleman');
    for (const e of [officer, ...f.list.slice(-2)]) {
      const c = f.nav.nearest(e.pos, { radius: 1.5, anyIsland: true });
      assert.ok(c >= 0 && f.nav.component[c] === f.nav.main, `${siteId}: ${e.id} stands on the main map (${e.pos.x.toFixed(1)}, ${e.pos.z.toFixed(1)})`);
    }
    assert.equal(f.sim.operation.view.kind, 'eliminate');
    if (siteId === mission.stages[0].sites[0]) {
      f.enemies.damage(officer, 1e4, { owner: 0, zone: 'body', point: officer.pos, dir: { x: 0, y: 0, z: -1 }, weapon: 'carbine' });
      f.run(0.2);
      assert.equal(f.sim.operation.view.kind, 'extract', 'on to extraction');
      assert.equal(f.sim.operation.view.checkpoint, 1, 'a checkpoint');
      f.sim.reset();
      f.run(0.2);
      const again = f.list.find((e) => e.hvt && !e.dead);
      assert.ok(again, 'a restart brings a fresh officer');
    }
    f.sim.dispose();
  }
});
