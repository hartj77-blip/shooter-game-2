// Enemy AI tests: senses, brains, squads and fairness rules
// (docs/lessons/08-how-enemies-think.md). Every fight here is seeded, so it
// plays out exactly the same way each run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFight, enemy } from '../support/ai.js';
import { ROLES, DIFFICULTY } from '../../src/ai/enemy-data.js';
import { traceShot } from '../../src/weapons/hitscan.js';
import { WEAPONS } from '../../src/weapons/weapons-data.js';

const NORTH = 0, SOUTH = Math.PI;
const wall = (from, to, extra = {}) => ({ type: 'wall', from, to, height: 3, ...extra });
const combatStates = ['engage', 'toCover', 'inCover', 'fight', 'flank', 'rush', 'perch', 'hunt'];

test('a patrol walks its loop, and nobody notices you behind a wall', async () => {
  const f = await makeFight({
    pieces: [
      enemy('rifleman', [0, 0, -20], { patrol: [[0, -20], [12, -20], [12, -28]] }),
      wall([-30, -8], [30, -8]),
    ],
  });
  const e = f.e();
  const visited = new Set();
  f.run(40, {}, () => {
    for (const [i, p] of e.patrol.entries()) if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < 0.6) visited.add(i);
  });
  assert.deepEqual([...visited].sort(), [0, 1, 2]);
  assert.equal(e.inCombat, false);
  assert.ok(['patrol'].includes(e.brainState));
});

test('a gunshot heard through a wall makes them suspicious, then they go and look', async () => {
  const f = await makeFight({
    spawn: [0, 0, 16],
    pieces: [enemy('rifleman', [0, 0, -12], { yaw: NORTH }), wall([-30, 0], [30, 0], { openings: [{ at: 55, width: 1.4 }] })],
  });
  const e = f.e();
  f.run(0.5);
  const states = [];
  f.run(0.1, { fire: true, firePressed: true, pitch: 1.2 }); // a shot into the sky, 28 m away through a wall
  f.run(5, {}, () => { if (states.at(-1) !== e.brainState) states.push(e.brainState); });
  assert.deepEqual(states.slice(0, 2), ['suspicious', 'investigate']);
  assert.equal(e.inCombat, false, "they haven't seen you");
  assert.ok(e.pos.x > 1, 'heading for the door to go and look');
});

test('crouch-walking behind someone is silent; sprinting is not', async () => {
  for (const [cmd, expectHeard] of [[{ moveX: 1, crouch: true }, false], [{ moveX: 1, sprint: true, moveZ: 1 }, true]]) {
    const f = await makeFight({ spawn: [-4, 0, 5], yaw: -Math.PI / 2, pieces: [enemy('rifleman', [0, 0, -5], { yaw: NORTH })] });
    f.run(3, cmd);
    assert.equal(!!f.e().senses.heard, expectHeard, JSON.stringify(cmd));
  }
});

test('in plain view you get spotted, and that starts a fight', async () => {
  const f = await makeFight({ pieces: [enemy('rifleman', [0, 0, -15], { yaw: SOUTH })] });
  f.run(2.5);
  const e = f.e();
  assert.equal(e.senses.awareness, 1);
  assert.ok(e.inCombat);
  assert.ok(combatStates.includes(e.brainState), e.brainState);
  assert.ok(f.log.some((x) => x.name === 'enemy:bark' && x.kind === 'spotted'));
});

test('crouched and still at range, you are noticed much more slowly than standing close', async () => {
  const far = await makeFight({ pieces: [enemy('rifleman', [0, 0, -35], { yaw: SOUTH })] });
  far.run(0.1, { crouch: true });
  far.run(1.5, { crouch: true });
  const near = await makeFight({ pieces: [enemy('rifleman', [0, 0, -8], { yaw: SOUTH })] });
  near.run(1.6, { moveX: 1 });
  assert.ok(near.e().senses.awareness >= 1);
  assert.ok(far.e().senses.awareness < 0.6, `far awareness ${far.e().senses.awareness.toFixed(2)}`);
});

test('no shot before the reaction time, and the first burst is a warning that misses', async () => {
  const f = await makeFight({ pieces: [enemy('rifleman', [0, 0, -15], { yaw: SOUTH })] });
  const e = f.e();
  let firstSeen = null;
  f.run(10, {}, () => { if (firstSeen === null && e.senses.visible) firstSeen = f.time; });
  const shots = f.log.filter((x) => x.name === 'weapon:fire' && x.owner === e.owner);
  assert.ok(shots.length > 0, 'it did shoot');
  assert.ok(shots[0].time - firstSeen >= ROLES.rifleman.reaction, `reacted after ${(shots[0].time - firstSeen).toFixed(2)} s`);
  const firstHurt = f.log.find((x) => x.name === 'player:hurt');
  // Find the end of the first burst: the first gap of over 0.3 s between shots.
  let end = shots[0].time;
  for (const s of shots) { if (s.time - end > 0.3) break; end = s.time; }
  assert.ok(!firstHurt || firstHurt.time > end, 'the warning burst missed');
  assert.ok(f.count('bullet:nearmiss') > 0, 'but you heard it go past');
  assert.ok(firstHurt, 'later bursts do hit if you just stand there');
});

test('shot at from out of sight, they take cover that hides them from you', async () => {
  const f = await makeFight({
    spawn: [0, 0, 10],
    pieces: [
      enemy('rifleman', [0, 0, -12], { yaw: NORTH }),               // facing away
      { type: 'box', size: [3, 1, 0.6], at: [3, 0, -10] },            // low cover
      { type: 'box', size: [2, 2.6, 2], at: [-5, 0, -12] },           // high cover
    ],
  });
  const e = f.e();
  f.run(0.5);
  // Shoot near them (high, so it can't hit).
  f.look.pitch = Math.atan2(2.5, 22);
  f.run(0.3, { fire: true, firePressed: true });
  f.run(4);
  assert.ok(e.inCombat);
  assert.ok(['inCover', 'toCover'].includes(e.brainState), e.brainState);
  assert.ok(e.coverSpot, 'picked a spot');
  const eye = { ...f.soldier.state.pos, y: 1.6 };
  assert.ok(f.cover.evaluate(e.coverSpot.point, eye).safe, 'that hides them from where you are');
});

test('attack tokens: no more than two enemies shoot at you at once (Regular)', async () => {
  const pieces = [-12, -6, 0, 6, 12].map((x) => enemy('rifleman', [x, 0, -18], { yaw: SOUTH, squad: 'a' }));
  const f = await makeFight({ pieces, god: true });
  let most = 0;
  const firedAt = new Map();
  f.run(15, {}, () => {
    let general = 0;
    for (const h of f.enemies.tokens.holders.values()) if (h.pool === 'general') general++;
    most = Math.max(most, general);
  });
  for (const x of f.log) if (x.name === 'weapon:fire') firedAt.set(x.owner, (firedAt.get(x.owner) ?? 0) + 1);
  assert.ok(most <= DIFFICULTY.regular.tokens, `${most} held at once`);
  assert.ok(firedAt.size >= 3, `the tickets get passed round (${firedAt.size} enemies fired)`);
});

test("the Marksman's laser is on you for the telegraph time before every shot", async () => {
  const f = await makeFight({ pieces: [enemy('marksman', [0, 0, -40], { yaw: SOUTH, perch: true })], god: true, bounds: { min: [-30, -60], max: [30, 30] } });
  const e = f.e();
  let laserFor = 0;
  const before = [];
  f.events.on('weapon:fire', (x) => { if (x.owner === e.owner) before.push(laserFor); });
  f.run(14, {}, () => { laserFor = e.motor.laserOn ? laserFor + 1 / 60 : 0; });
  assert.ok(before.length >= 2, `${before.length} shots`);
  for (const t of before) assert.ok(t >= ROLES.marksman.telegraph - 0.02, `laser on for ${t.toFixed(2)} s first`);
});

test('when you hide they search where you were, not where you are', async () => {
  const f = await makeFight({
    pieces: [enemy('rifleman', [0, 0, -16], { yaw: SOUTH }), wall([-30, 8], [30, 8])],
    god: true,
  });
  const e = f.e();
  f.run(3);
  assert.ok(e.inCombat);
  const lastSeen = { ...f.soldier.state.pos };
  f.teleport([20, 0, 20]); // gone, behind the wall
  const states = [];
  f.run(14, {}, () => { if (states.at(-1) !== e.brainState) states.push(e.brainState); });
  assert.ok(states.includes('hunt'), states.join(' > '));
  const k = e.squad.knowledge.pos;
  assert.ok(Math.hypot(k.x - lastSeen.x, k.z - lastSeen.z) < 1.5, 'they still think you are where you were');
});

test('with nothing found for long enough, they calm down and go back to guarding', async () => {
  const f = await makeFight({ pieces: [enemy('rifleman', [0, 0, -16], { yaw: SOUTH }), wall([-30, 8], [30, 8])], god: true });
  const e = f.e();
  f.run(3);
  f.teleport([25, 0, 25]);
  f.run(60);
  assert.equal(e.inCombat, false);
  assert.equal(e.brainState, 'guard');
});

test('an enemy can follow a route up stairs to a platform', async () => {
  const f = await makeFight({
    spawn: [20, 0, 30],
    pieces: [
      { type: 'stairs', at: [0, 0, 0], width: 1.6, rise: 0.25, steps: 8, run: 0.35 },
      { type: 'box', size: [4, 2, 4], at: [0, 0, -4.8] },
      wall([-30, 20], [30, 20]),
      enemy('rifleman', [0, 0, 6], { patrol: [[0, 6, 0], [0, -5, 2]] }),
    ],
  });
  const e = f.e();
  let top = 0;
  f.run(12, {}, () => { top = Math.max(top, e.pos.y); });
  assert.ok(top > 1.9, `climbed to ${top.toFixed(2)} m`);
});

test('two headshots drop a Rifleman; its body leaves the physics world', async () => {
  const f = await makeFight({ pieces: [enemy('rifleman', [0, 0, -10], { yaw: NORTH })] });
  f.run(0.3);
  const e = f.e();
  const shot = { weapon: WEAPONS.carbine, origin: { x: 0, y: 1.68, z: 0 }, dir: { x: 0, y: (1.62 - 1.68) / 10, z: -1 } };
  const len = Math.hypot(shot.dir.y, 1);
  shot.dir = { x: 0, y: shot.dir.y / len, z: -1 / len };
  for (let i = 0; i < 2; i++) {
    const hit = traceShot(f.world, f.registry, shot, f.soldier).hits[0];
    assert.equal(hit.target, e);
    assert.equal(hit.zone, 'head');
    f.enemies.damage(e, hit.damage, { ...hit, from: shot.origin, dir: shot.dir, weapon: 'carbine', owner: 0 });
  }
  assert.equal(e.dead, true);
  assert.equal(f.count('enemy:down'), 1);
  f.run(0.1);
  assert.equal(traceShot(f.world, f.registry, shot, f.soldier).hits[0]?.target, undefined, 'bullets pass where it stood');
  assert.equal(f.enemies.alive.length, 0);
});

// Regression test: an enemy that got stuck while its route request was still
// queued lost the request's destination, and the route-finder crashed.
test('a route request that goes stale while it waits in the queue does not crash', async () => {
  const f = await makeFight({ pieces: [enemy('rifleman', [0, 0, -10], { patrol: [[0, -10], [8, -10]] })] });
  const e = f.e();
  f.run(0.2);
  e.intent.dest = { x: 8, y: 0, z: -10 };
  e.path.pending = false;
  f.enemies.ai.requestPath(e);
  e.path.dest = null; // what the stuck check used to do
  assert.doesNotThrow(() => f.run(0.1));
  assert.ok(e.path.points.length > 0, 'it still got a route');
});

test('a fight plays out exactly the same twice (determinism)', async () => {
  const play = async () => {
    const f = await makeFight({
      seed: 5,
      pieces: [
        enemy('rifleman', [-6, 0, -18], { yaw: SOUTH, squad: 'a' }),
        enemy('rusher', [6, 0, -20], { yaw: SOUTH, squad: 'a' }),
        { type: 'box', size: [3, 1, 0.6], at: [-4, 0, -14] },
        { type: 'box', size: [2, 2.6, 2], at: [6, 0, -14] },
      ],
    });
    f.run(12, (i) => ({ moveX: Math.sin(i / 40), crouch: i % 300 > 200 }));
    return { pos: f.list.map((e) => [e.pos.x, e.pos.z, e.brainState]), hp: f.health.state.hp, log: f.log.length };
  };
  assert.deepEqual(await play(), await play());
});

test('difficulty scales how much their bullets hurt', async () => {
  const hurt = async (difficulty) => {
    const f = await makeFight({ difficulty, pieces: [enemy('rifleman', [0, 0, -12], { yaw: SOUTH })] });
    f.run(14);
    const first = f.log.find((x) => x.name === 'player:hurt');
    return first ? first.raw : null;
  };
  const recruit = await hurt('recruit');
  const veteran = await hurt('veteran');
  assert.ok(recruit && veteran);
  assert.ok(Math.abs(recruit / veteran - DIFFICULTY.recruit.damage / DIFFICULTY.veteran.damage) < 0.3);
});
