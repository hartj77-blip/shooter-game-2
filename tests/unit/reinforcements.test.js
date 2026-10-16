// Reinforcements: enemies who arrive in the middle of a mission
// (docs/lessons/15-the-director.md). They're added with enemies.spawn(), walk
// in along a route, and are then radioed where the squad is. A checkpoint
// quietly takes away (retires) the ones you'd already dealt with.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFight, enemy } from '../support/ai.js';
import { makeCoop } from '../support/coop.js';
import { idleCommand } from '../../src/core/input.js';
import compound from '../../levels/compound.js';

// You, shut in a small room with no windows: nobody can see you, so anyone who
// finds you was told where to look.
const ROOM = [
  { type: 'wall', from: [-3, -3], to: [3, -3], height: 3 },
  { type: 'wall', from: [3, -3], to: [3, 3], height: 3, openings: [{ at: 3, width: 1.4, top: 2.3 }] }, // the door faces east
  { type: 'wall', from: [3, 3], to: [-3, 3], height: 3 },
  { type: 'wall', from: [-3, 3], to: [-3, -3], height: 3 },
];

test('a reinforcement walks in along its route, then is radioed where you are and comes looking', async () => {
  // (One guard far off in a corner, minding their own business.)
  const f = await makeFight({ pieces: [...ROOM, enemy('rifleman', [35, 0, 35], { yaw: Math.PI / 4 })], god: true });
  const e = f.enemies.spawn({ role: 'rifleman', at: [-30, 0, -30], squad: 'r1' }, { route: [[-30, -15], [-15, -10], [-10, 0]] });
  assert.equal(e.index, 1, 'numbered after the level’s own');
  assert.equal(e.id, 'e1');
  assert.equal(f.enemies.list.at(-1), e, 'in the list');
  f.run(0.3);
  assert.equal(e.brainState, 'advance', 'running in');
  assert.ok(!e.inCombat, 'not fighting yet');
  let combatAt = null;
  f.run(20, {}, () => { if (combatAt === null && e.inCombat) combatAt = { ...e.pos }; });
  assert.ok(combatAt, 'in the fight once it arrived');
  assert.ok(Math.hypot(combatAt.x + 10, combatAt.z) < 3, `went into combat at the end of its route (${combatAt.x.toFixed(1)}, ${combatAt.z.toFixed(1)})`);
  assert.equal(e.advance, null, 'the route is done');
  assert.ok(f.count('enemy:bark', (b) => b.kind === 'arrive') >= 1, 'it said so on arrival');
  const k = e.squad.knowledge;
  assert.ok(k && Math.hypot(k.pos.x, k.pos.z) < 1, 'its squad knows (roughly) where you are');
  assert.equal(k.seen, false, '... from the radio, not its own eyes');
});

test('spawning someone leaves every other squad as it was', async () => {
  const f = await makeFight({
    pieces: [enemy('rifleman', [20, 0, -20], { squad: 'a' }), enemy('rifleman', [22, 0, -20], { squad: 'a' })],
    god: true,
  });
  f.run(0.2);
  const a = f.enemies.squads.get('a');
  f.enemies.ai.report(f.e(0), { x: 5, y: 0, z: 5 }, false, 0);
  const knew = a.knowledge;
  const joined = f.enemies.spawn({ role: 'rusher', at: [24, 0, -20], squad: 'a' });
  const fresh = f.enemies.spawn({ role: 'rifleman', at: [-20, 0, -20], squad: 'b' });
  assert.equal(f.enemies.squads.get('a'), a, 'the same squad');
  assert.equal(a.knowledge, knew, 'that still knows what it knew');
  assert.equal(a.members.length, 3, 'with one more member');
  assert.equal(joined.squad, a);
  assert.equal(fresh.squad.knowledge, null, 'a new squad knows nothing yet');
  assert.equal(f.enemies.squads.size, 2);
  assert.deepEqual(f.list.map((x) => x.id), ['e0', 'e1', 'e2', 'e3'], 'numbered after the level’s own');
  assert.equal(f.enemies.alive.length, 4);
});

test('retiring an enemy is silent: no "man down", no alarm, no event', async () => {
  const f = await makeFight({
    pieces: [enemy('rifleman', [20, 0, -20], { squad: 'a' }), enemy('rifleman', [21.5, 0, -20], { squad: 'a' })],
    god: true,
  });
  f.run(0.5);
  const before = f.log.length;
  f.enemies.retire(f.e(0));
  f.run(2);
  assert.equal(f.e(0).dead, true);
  assert.equal(f.e(0).removed, true, 'gone from the physics world');
  assert.ok(!f.log.slice(before).some((x) => x.name === 'enemy:down' || (x.name === 'enemy:bark' && x.kind === 'manDown')), 'nobody noticed');
  assert.equal(f.e(1).inCombat, false, 'its squad-mate stays calm');
  assert.deepEqual(f.enemies.alive, [f.e(1)]);
});

test('a reset can leave some of the level’s enemies out (for checkpoints), and reinforcements go', async () => {
  const f = await makeFight({
    pieces: [enemy('rifleman', [20, 0, -20]), enemy('rusher', [22, 0, -20]), enemy('marksman', [24, 0, -20])],
    god: true,
  });
  f.enemies.spawn({ role: 'rifleman', at: [-20, 0, -20] });
  f.run(0.5);
  f.enemies.reset({ retired: [1] });
  assert.equal(f.list.length, 3, 'the reinforcement is gone');
  assert.deepEqual(f.list.map((e) => e.dead), [false, true, false]);
  assert.equal(f.list[1].retired, true);
  f.run(1);
  assert.equal(f.enemies.alive.length, 2);
});

test('co-op: a client sees a reinforcement as the right kind of soldier, and can shoot it', async () => {
  const g = await makeCoop({ def: compound, clients: 1, net: { delay: 40, jitter: 10 } });
  g.sim.enemies.options.freeze = true;
  g.sim.player(1).health.godMode = true;
  g.sim.player(1).soldier.teleport([-14, 0, 30], 0);
  g.run(0.5);
  const r = g.sim.enemies.spawn({ role: 'rusher', at: [-14, 0, 26], yaw: Math.PI, squad: 'r1' });
  g.run(0.6);
  const c = g.client(1);
  const proxy = c.enemies.list.find((p) => p.id === r.id);
  assert.ok(proxy, 'a stand-in appeared');
  assert.equal(proxy.role, 'rusher');
  assert.equal(proxy.view.weapon, 'smg');
  const me = c.local.soldier;
  const aim = () => {
    const eye = { x: me.state.pos.x, y: me.state.pos.y + me.body.eyeHeight(), z: me.state.pos.z };
    const t = { x: proxy.view.pos.x, y: proxy.view.pos.y + 1.2, z: proxy.view.pos.z };
    const dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z;
    return { ...idleCommand(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))), fire: true };
  };
  g.run(1.5, (slot) => (slot === 1 ? aim() : null));
  g.run(0.5);
  assert.equal(r.dead, true, 'dead on the host');
  assert.equal(proxy.view.dead, true, 'and on the client');
  g.dispose();
});
