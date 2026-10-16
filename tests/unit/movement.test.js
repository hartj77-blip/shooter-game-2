// Movement tests: drive the real player controller through small test worlds.
// Each test is a question you could also answer by playing, e.g.
// "can I walk up 0.3 m steps?", answered automatically in a fraction of a second.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, tap } from '../support/sim.js';
import { DEFAULT_TUNING, BODY, createPlayer } from '../../src/player/controller.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';

const near = (actual, expected, tolerance, what) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: expected ${expected} ± ${tolerance}, got ${actual.toFixed(3)}`);

test('spawns, falls a few centimetres and stands on the floor', async () => {
  const sim = await makeSim();
  sim.settle();
  assert.equal(sim.state.mode, 'ground');
  assert.ok(sim.state.grounded);
  near(sim.state.pos.y, 0, 0.03, 'feet height');
});

test('walking forward reaches walking speed, heading north', async () => {
  const sim = await makeSim();
  sim.settle();
  sim.run(1.5, { moveZ: 1 });
  near(sim.state.speed, DEFAULT_TUNING.walkSpeed, 0.05, 'walk speed');
  assert.ok(sim.state.pos.z < -5, 'moved north (negative z)');
  near(sim.state.pos.x, 0, 0.05, 'no noticeable sideways drift');
});

test('diagonal movement is not faster than straight movement', async () => {
  const sim = await makeSim();
  sim.settle();
  sim.run(1.5, { moveZ: 1, moveX: 1 });
  near(sim.state.speed, DEFAULT_TUNING.walkSpeed, 0.05, 'diagonal speed');
});

// Regression test (milestone 3): a patrolling enemy crept along at 0.2 m/s
// because the minimum friction ("stopSpeed") was stronger than a slow walk's push.
test('a half-pushed stick walks at a slow, steady speed instead of creeping', async () => {
  for (const pace of [0.25, 0.5]) {
    const sim = await makeSim();
    sim.settle();
    sim.run(1.5, { moveZ: pace });
    near(sim.state.speed, DEFAULT_TUNING.walkSpeed * pace, 0.05, `speed at pace ${pace}`);
  }
});

test('sprinting is faster, but only going forwards', async () => {
  const sim = await makeSim();
  sim.settle();
  sim.run(1.5, { moveZ: 1, sprint: true });
  assert.ok(sim.state.sprinting);
  near(sim.state.speed, DEFAULT_TUNING.sprintSpeed, 0.05, 'sprint speed');
  sim.run(1.5, { moveZ: -1, sprint: true });
  assert.equal(sim.state.sprinting, false, 'cannot sprint backwards');
  near(sim.state.speed, DEFAULT_TUNING.walkSpeed * DEFAULT_TUNING.backwardScale, 0.05, 'backwards speed');
});

test('letting go stops you quickly', async () => {
  const sim = await makeSim();
  sim.settle();
  sim.run(1, { moveZ: 1 });
  sim.run(0.35);
  assert.ok(sim.state.speed < 0.05, `stopped within 0.35 s, still at ${sim.state.speed.toFixed(2)} m/s`);
});

test('a jump reaches the tuned jump height and lands again', async () => {
  const sim = await makeSim();
  sim.settle();
  const { peakY } = sim.run(1.2, tap('jump'));
  near(peakY, DEFAULT_TUNING.jumpHeight, 0.05, 'jump apex');
  assert.equal(sim.state.mode, 'ground');
  assert.ok(sim.log.some((e) => e.name === 'player:land'));
});

test('coyote time: you can still jump just after running off an edge', async () => {
  // Platform from z = -2 to z = 2, 1 m high. Walk north off its far edge.
  const ledge = [{ type: 'box', size: [4, 1, 4], at: [0, 0, 0] }];

  const late = await makeSim(ledge, { spawn: [0, 1, 1.5] });
  late.settle();
  late.run(3, (i) => ({ moveZ: 1, jump: false, ...(late.state.mode === 'air' && late.state.coyote < 0.06 && late.state.coyote > 0 ? { jump: true } : {}) }));
  assert.ok(late.log.some((e) => e.name === 'player:jump'), 'jump pressed shortly after leaving the edge still works');

  const tooLate = await makeSim(ledge, { spawn: [0, 1, 1.5] });
  tooLate.settle();
  let airTicks = 0;
  tooLate.run(3, () => {
    if (tooLate.state.mode === 'air') airTicks++;
    return { moveZ: 1, jump: airTicks === 20 }; // a third of a second after leaving the edge
  });
  assert.ok(!tooLate.log.some((e) => e.name === 'player:jump'), 'jump pressed long after leaving the edge does nothing');
});

test('jump buffer: pressing jump just before landing jumps again on landing', async () => {
  const sim = await makeSim();
  sim.settle();
  let pressed = false;
  sim.run(2, (i) => {
    if (i === 0) return { jump: true };
    // Falling and about 10 cm from the floor: press again.
    if (!pressed && sim.state.vel.y < 0 && sim.state.pos.y < 0.15) {
      pressed = true;
      return { jump: true };
    }
    return {};
  });
  assert.equal(sim.log.filter((e) => e.name === 'player:jump').length, 2);
});

test('walls stop you and you slide along them', async () => {
  // A wall across the path at z = -5, running east-west.
  const sim = await makeSim([{ type: 'box', size: [20, 3, 1], at: [0, 0, -5.5] }]);
  sim.settle();
  sim.run(2, { moveZ: 1 });
  assert.ok(sim.state.pos.z > -5 - BODY.radius - 0.05, `stopped at the wall, z = ${sim.state.pos.z.toFixed(2)}`);
  // Walking diagonally into it should slide you along it (east).
  const x0 = sim.state.pos.x;
  sim.run(1, { moveZ: 1, moveX: 1 });
  assert.ok(sim.state.pos.x - x0 > 2, 'slid along the wall');
});

test('steps up to 0.3 m are climbed by just walking', async () => {
  for (const rise of [0.2, 0.3]) {
    const sim = await makeSim([{ type: 'stairs', at: [0, 0, -2], width: 3, rise, steps: 4, run: 0.4, landing: 20 }]);
    sim.settle();
    sim.run(3, { moveZ: 1 });
    near(sim.state.pos.y, rise * 4, 0.05, `top of ${rise} m stairs`);
  }
});

test('crouch-walking (slowly) climbs stairs too', async () => {
  // A regression test: slow movement used to get stuck on the first step.
  const sim = await makeSim([{ type: 'stairs', at: [0, 0, -2], width: 3, rise: 0.3, steps: 4, run: 0.4, landing: 20 }]);
  sim.settle();
  sim.run(4, { moveZ: 1, crouch: true });
  near(sim.state.pos.y, 1.2, 0.05, 'top of the stairs, crouched');
});

test('a 0.5 m step blocks walking, but a jump gets you up', async () => {
  const block = [{ type: 'box', size: [4, 0.5, 20], at: [0, 0, -12] }];
  const walk = await makeSim(block);
  walk.settle();
  walk.run(2, { moveZ: 1 });
  near(walk.state.pos.y, 0, 0.05, 'still on the floor');

  const hop = await makeSim(block);
  hop.settle();
  hop.run(1, { moveZ: 1 });
  hop.run(1.5, tap('jump', { moveZ: 1 }));
  near(hop.state.pos.y, 0.5, 0.05, 'on top of the block');
});

test('a 30° ramp can be walked up, a 55° ramp cannot', async () => {
  const ramp = (angle) => [{ type: 'ramp', at: [0, 0, -2 - 1 / Math.tan((angle * Math.PI) / 180)], width: 4, height: 2, length: 2 / Math.tan((angle * Math.PI) / 180), landing: 20 }];
  const gentle = await makeSim(ramp(30));
  gentle.settle();
  gentle.run(3, { moveZ: 1 });
  near(gentle.state.pos.y, 2, 0.05, 'top of the 30° ramp');

  const steep = await makeSim(ramp(55));
  steep.settle();
  steep.run(3, { moveZ: 1 });
  assert.ok(steep.state.pos.y < 0.6, `could not climb 55°, got to ${steep.state.pos.y.toFixed(2)} m`);
});

test('crouching makes you shorter, and you cannot stand up under a low roof', async () => {
  // Roof from 1.3 m to 2 m, starting 2 m north of spawn.
  const sim = await makeSim([{ type: 'box', size: [4, 0.7, 6], at: [0, 1.3, -5] }]);
  sim.settle();
  sim.run(0.2, { crouch: true });
  assert.ok(sim.state.crouched);
  assert.equal(sim.player.height(), BODY.crouchHeight);
  sim.run(2, { crouch: true, moveZ: 1 });
  assert.ok(sim.state.pos.z < -3, 'walked under the roof while crouched');
  sim.run(0.2, {});
  assert.ok(sim.state.crouched, 'still crouched: no room to stand');
  assert.ok(sim.state.standBlocked);
  sim.run(3, { moveZ: -1 });
  assert.ok(!sim.state.crouched, 'stood up again once out from under the roof');
});

test('a standing player cannot walk under a low roof', async () => {
  const sim = await makeSim([{ type: 'box', size: [4, 0.7, 6], at: [0, 1.3, -5] }]);
  sim.settle();
  sim.run(2, { moveZ: 1 });
  assert.ok(sim.state.pos.z > -2.1, `stopped at the roof edge, z = ${sim.state.pos.z.toFixed(2)}`);
});

test('sliding: sprint then crouch gives a burst of speed, then slows into a crouch', async () => {
  const sim = await makeSim();
  sim.settle();
  sim.run(1.5, { moveZ: 1, sprint: true });
  sim.run(1 / 60, { moveZ: 1, sprint: true, crouch: true, crouchPressed: true });
  assert.equal(sim.state.mode, 'slide');
  assert.ok(sim.state.speed > DEFAULT_TUNING.sprintSpeed + 1, `boosted to ${sim.state.speed.toFixed(2)} m/s`);
  sim.run(2, { moveZ: 1, crouch: true });
  assert.equal(sim.state.mode, 'ground', 'slide ended');
  assert.ok(sim.state.crouched, 'ended crouched');
  near(sim.state.speed, DEFAULT_TUNING.crouchSpeed, 0.1, 'crouch-walking afterwards');
});

test('you cannot slide from a walk', async () => {
  const sim = await makeSim();
  sim.settle();
  sim.run(1.5, { moveZ: 1 });
  sim.run(1 / 60, { moveZ: 1, crouch: true, crouchPressed: true });
  assert.notEqual(sim.state.mode, 'slide');
});

test('slides speed up going downhill', async () => {
  // A long 20° slope going down towards the north: high end at the south.
  const angle = 20;
  const length = 30;
  const height = length * Math.tan((angle * Math.PI) / 180);
  const sim = await makeSim([
    { type: 'box', size: [6, height, 10], at: [0, 0, 5] },
    { type: 'ramp', at: [0, 0, -length / 2], rotY: Math.PI, width: 6, length, height },
  ], { spawn: [0, height, 4] });
  sim.settle();
  sim.run(1.2, { moveZ: 1, sprint: true });
  sim.run(1 / 60, { moveZ: 1, sprint: true, crouch: true, crouchPressed: true });
  const start = sim.state.speed;
  sim.run(1, { moveZ: 1, crouch: true });
  assert.equal(sim.state.mode, 'slide', 'still sliding on the slope');
  assert.ok(sim.state.speed > start, `sped up from ${start.toFixed(2)} to ${sim.state.speed.toFixed(2)} m/s`);
});

test('mantle: press jump at a 1.25 m ledge to climb on top', async () => {
  const sim = await makeSim([{ type: 'box', size: [3, 1.25, 6], at: [0, 0, -4] }]);
  sim.settle();
  sim.run(0.5, { moveZ: 1 });
  sim.run(1.2, tap('jump', { moveZ: 1 }));
  assert.ok(sim.log.some((e) => e.name === 'player:mantle'), 'mantled');
  near(sim.state.pos.y, 1.25, 0.05, 'standing on the ledge');
  assert.ok(sim.state.pos.z < -1, 'moved onto the top');
});

test('mantle: a 2.25 m ledge needs a jump first; 2.75 m is out of reach', async () => {
  const reachable = await makeSim([{ type: 'box', size: [3, 2.25, 6], at: [0, 0, -4] }]);
  reachable.settle();
  reachable.run(0.5, { moveZ: 1 });
  reachable.run(1.5, tap('jump', { moveZ: 1 }));
  near(reachable.state.pos.y, 2.25, 0.05, 'on top of the 2.25 m ledge');

  const tooHigh = await makeSim([{ type: 'box', size: [3, 2.75, 6], at: [0, 0, -4] }]);
  tooHigh.settle();
  tooHigh.run(0.5, { moveZ: 1 });
  tooHigh.run(1.5, tap('jump', { moveZ: 1 }));
  assert.ok(!tooHigh.log.some((e) => e.name === 'player:mantle'));
  near(tooHigh.state.pos.y, 0, 0.05, 'back on the floor');
});

test('mantle into a gap too low to stand in ends crouched', async () => {
  // A 1 m ledge with a roof 1.3 m above it.
  const sim = await makeSim([
    { type: 'box', size: [3, 1, 3], at: [0, 0, -2.5] },
    { type: 'box', size: [3, 0.5, 3], at: [0, 2.3, -2.5] },
  ]);
  sim.settle();
  sim.run(0.5, { moveZ: 1 });
  sim.run(1, tap('jump', { moveZ: 1 }));
  near(sim.state.pos.y, 1, 0.05, 'on the ledge');
  assert.ok(sim.state.crouched, 'crouched under the roof');
});

test('the same commands always give exactly the same result (determinism)', async () => {
  // Networked games depend on this: replaying the same inputs must reproduce the same movement.
  const script = (i) => ({ moveZ: 1, moveX: i % 90 < 45 ? 1 : -1, sprint: i > 30, jump: i % 70 === 0, yaw: i * 0.01 });
  const a = await makeSim([{ type: 'box', size: [2, 1, 2], at: [3, 0, -6] }]);
  const b = await makeSim([{ type: 'box', size: [2, 1, 2], at: [3, 0, -6] }]);
  a.run(4, script);
  b.run(4, script);
  assert.deepEqual(a.state.pos, b.state.pos);
  assert.deepEqual(a.state.vel, b.state.vel);
});

test('you climb ledges, not people: jumping right in front of a crouching soldier never starts a climb (regression)', async () => {
  const sim = await makeSim();
  // Someone crouching 1.5 m ahead: about as tall as a crate you could climb.
  const other = createPlayer({ world: sim.world, spawn: { pos: [0, 0, -1.5], yaw: 0 }, events: sim.events, owner: 1 });
  sim.settle();
  const crouch = () => {
    other.update({ ...idleCommand(0), crouch: true }, SIM_DT);
    sim.world.step();
  };
  for (let i = 0; i < 30; i++) crouch();
  // Walk up against them, then press jump.
  for (let i = 0; i < 90; i++) {
    sim.player.update({ ...idleCommand(0), moveZ: 1, jump: i === 50, jumpHeld: i >= 50 && i < 60 }, SIM_DT);
    crouch();
    assert.notEqual(sim.state.mode, 'mantle', `tick ${i}: climbing onto someone`);
  }
  // (A plain jump that lands on their back is allowed: plenty of co-op games let you.)
});
