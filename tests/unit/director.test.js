// The director (docs/lessons/15-the-director.md): pacing reinforcements so a
// mission has a rhythm, and spawning them fairly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFight } from '../support/ai.js';
import { yard, RESCUE, walk, holdF } from '../support/missions.js';
import { initPhysics } from '../../src/world/physics.js';
import { createSim } from '../../src/game/sim.js';
import { idleCommand } from '../../src/core/input.js';
import { OBJECTIVES } from '../../src/game/objectives.js';

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const NORTH = { x: 0, z: -37 };
const WEST = { x: -37, z: 0 };

test('a wave comes in at an entry nobody can see, never closer than the minimum distance, and runs in along its route', async () => {
  const f = await makeFight({ level: yard(RESCUE), god: true });
  const d = f.sim.director;
  f.enemies.options.freeze = true;
  const n = d.wave({ size: 3 });
  assert.equal(n, 3);
  const wave = f.list.slice(2);
  assert.equal(wave.length, 3);
  const from = flat(wave[0].pos, NORTH) < 3 ? 'north' : flat(wave[0].pos, WEST) < 3 ? 'west' : 'somewhere else';
  assert.notEqual(from, 'somewhere else', 'at one of the entries');
  for (const e of wave) {
    assert.ok(e.advance?.length, 'with a route to run in along');
    assert.equal(e.squad, wave[0].squad, 'one squad');
    assert.ok(flat(e.pos, f.soldier.state.pos) > d.tuning.minDistance);
  }
  // Now stand where the north entry is in plain view (and far enough away): it's never used.
  f.teleport([36, 0, -37], -Math.PI / 2);
  for (let i = 0; i < 4; i++) d.wave({ size: 1 });
  for (const e of f.list.slice(5)) assert.ok(flat(e.pos, WEST) < 3, 'from the west, out of sight');
  // Right next to the west entry: too close, and the north one is in sight: no wave at all.
  f.teleport([-30, 0, -36], 0);
  const before = f.list.length;
  assert.equal(d.wave({ size: 2 }), 0, 'nowhere fair: nobody comes');
  assert.equal(f.list.length, before);
});

test('never more enemies standing than maxAlive (the garrison counts)', async () => {
  const f = await makeFight({ level: yard(RESCUE), god: true });
  const d = f.sim.director;
  f.enemies.options.freeze = true;
  for (let i = 0; i < 10; i++) d.wave({ size: 5 });
  assert.equal(f.enemies.alive.length, d.tuning.maxAlive[0], `capped at ${d.tuning.maxAlive[0]} for one player`);
});

test('phases: calm, then waves while building up; a hard fight is a peak, then a breather, then it builds again', async () => {
  const f = await makeFight({
    level: yard({ ...RESCUE, director: { calm: 3, gap: [4, 4], relax: [5, 5] } }), god: true,
  });
  const d = f.sim.director;
  f.enemies.options.freeze = true;
  assert.equal(d.phase, 'calm');
  f.run(3.2);
  assert.equal(d.phase, 'build');
  f.run(1);
  assert.ok(d.waves >= 1, 'the first wave');
  // A rough few seconds: you're hurt badly.
  f.events.emit('player:hurt', { owner: 0, amount: 70 });
  f.run(0.1);
  assert.equal(d.phase, 'peak', 'that is a peak');
  const waves = d.waves;
  f.run(5);
  assert.equal(d.waves, waves, 'no new waves at a peak');
  f.run(10); // intensity drains away
  assert.equal(d.phase, 'relax');
  f.run(5.5);
  assert.equal(d.phase, 'build', 'and it builds again');
});

test('a key moment from the mission: freeing the hostage brings a wave from the named entry, with a word on the radio', async () => {
  const f = await makeFight({
    level: yard({ ...RESCUE, moments: { 'rescue:freed': { wave: 2, entry: 'west', say: 'They know. Move!' } } }), god: true,
  });
  f.enemies.options.freeze = true;
  const radio = [];
  f.events.on('mission:radio', (e) => radio.push(e.text));
  walk(f, { x: 20, z: -8.8 });
  holdF(f, OBJECTIVES.free + 0.2);
  const wave = f.list.slice(2);
  assert.equal(wave.length, 2);
  for (const e of wave) assert.ok(flat(e.pos, WEST) < 3, 'from the west');
  assert.deepEqual(radio, ['They know. Move!']);
});

test('the crescendo: once the helicopter is called, waves keep coming whatever the intensity', async () => {
  const f = await makeFight({ level: yard({ ...RESCUE, moments: { 'extract:called': { crescendo: true } }, director: { crescendoGap: 3 } }), god: true });
  f.enemies.options.freeze = true;
  f.sim.director.moment('extract:called');
  assert.equal(f.sim.director.phase, 'crescendo');
  f.events.emit('player:hurt', { owner: 0, amount: 90 });
  const before = f.sim.director.waves;
  f.run(8); // the first within 4 s, then one every 3 s
  assert.ok(f.sim.director.waves >= before + 2, 'still coming');
});

test('the same seed and the same commands give the same waves (deterministic)', async () => {
  await initPhysics();
  const play = () => {
    const sim = createSim({ def: yard({ ...RESCUE, director: { calm: 2, gap: [3, 5] } }), seed: 42 });
    const log = [];
    sim.events.on('director:wave', (e) => log.push([e.entry, e.count]));
    for (let i = 0; i < 60 * 20; i++) sim.tick(1 / 60, { ...idleCommand(0), moveX: i % 200 < 100 ? 0.3 : -0.3 });
    const roles = sim.enemies.list.map((e) => [e.role, Math.round(e.pos.x * 100), Math.round(e.pos.z * 100)]);
    sim.dispose();
    return { log, roles };
  };
  const a = play();
  const b = play();
  assert.ok(a.log.length >= 2, `a few waves (${a.log.length})`);
  assert.deepEqual(a, b);
});
