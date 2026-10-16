// Controllers: sticks and buttons become the same commands the keyboard makes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeStick, moveStick, GAMEPAD } from '../../src/core/gamepad.js';
import { createInput } from '../../src/core/input.js';
import { roundCommand } from '../../src/net/protocol.js';

// A pretend controller: axes [lx, ly, rx, ry], and which buttons are down.
function fakePad() {
  const pad = { connected: true, timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  return {
    pad,
    set(i, on) { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; pad.timestamp++; },
    axes(a) { pad.axes = a; pad.timestamp++; },
  };
}
const target = { addEventListener() {} };
const playing = (pad, settings = {}) => {
  const input = createInput({ target, doc: null, settings, getPads: () => [pad.pad] });
  input.enabled = true;
  return input;
};

test('a stick at rest (a little drift) does nothing; small tilts turn slowly, full tilts fast', () => {
  assert.deepEqual(shapeStick(0.08, -0.05), { x: 0, y: 0, amount: 0 });
  const half = shapeStick(0.55, 0).x;
  const full = shapeStick(1, 0).x;
  assert.ok(full > 0.99);
  assert.ok(half < full * 0.3, `half tilt turns at ${half.toFixed(2)} of full (a curve, not a straight line)`);
  // Moving keeps a straight line: half tilt walks at about half speed.
  assert.ok(Math.abs(moveStick(0, 0.55).y - 0.5) < 0.01);
});

test('the left stick walks, the right stick turns, and the command is what the keyboard would make', () => {
  const p = fakePad();
  const input = playing(p);
  p.axes([0, -1, 0.6, 0]); // full forward, look a bit right
  input.pollPad(1 / 60);
  const cmd = input.sample();
  assert.equal(cmd.moveZ, 1);
  assert.equal(cmd.moveX, 0);
  assert.ok(input.yaw < 0, 'turned right (yaw decreases clockwise)');
  assert.equal(input.device, 'pad');
  // It survives the trip to a co-op host unchanged.
  assert.deepEqual(roundCommand(cmd).moveZ, 1);
});

test('buttons: RT fires, LT aims, A jumps once, RB throws a grenade, L3 sprints until you stop', () => {
  const p = fakePad();
  const input = playing(p);
  p.set(7, true); p.set(6, true); p.set(0, true); p.set(5, true);
  p.axes([0, -1, 0, 0]);
  input.pollPad(1 / 60);
  let cmd = input.sample();
  assert.ok(cmd.fire && cmd.firePressed && cmd.ads && cmd.jump && cmd.grenade);
  input.pollPad(1 / 60);
  cmd = input.sample();
  assert.ok(cmd.fire && !cmd.firePressed && !cmd.jump && !cmd.grenade, 'held, not pressed again');
  p.set(10, true);
  input.pollPad(1 / 60);
  p.set(10, false);
  input.pollPad(1 / 60);
  assert.ok(input.sample().sprint, 'L3 starts a sprint that keeps going');
  p.axes([0, 0, 0, 0]);
  input.pollPad(1 / 60);
  input.sample();
  p.axes([0, -1, 0, 0]);
  input.pollPad(1 / 60);
  assert.ok(!input.sample().sprint, 'stopping ends it');
});

test('X: a tap reloads; holding it uses things (revive, ammo crates)', () => {
  const p = fakePad();
  const input = playing(p);
  p.set(2, true);
  input.pollPad(0.05);
  p.set(2, false);
  input.pollPad(0.05);
  let cmd = input.sample();
  assert.ok(cmd.reload && !cmd.interact, 'a tap is a reload');
  p.set(2, true);
  for (let i = 0; i < 10; i++) input.pollPad(0.05);
  cmd = input.sample();
  assert.ok(cmd.interact && !cmd.reload, 'a hold is "use", and no reload');
  p.set(2, false);
  input.pollPad(0.05);
  cmd = input.sample();
  assert.ok(!cmd.interact && !cmd.reload, 'letting go of a hold reloads nothing');
});

test('aim assist and the look-speed setting scale the turning', () => {
  const turn = (settings, assist = 1) => {
    const p = fakePad();
    const input = playing(p, settings);
    input.assist = assist;
    p.axes([0, 0, 1, 0]);
    input.pollPad(0.1);
    return -input.yaw;
  };
  const base = turn({});
  assert.ok(Math.abs(base - (GAMEPAD.yawSpeed * Math.PI / 180) * 0.1) < 1e-6);
  assert.ok(Math.abs(turn({}, GAMEPAD.assistSlow) - base * GAMEPAD.assistSlow) < 1e-9);
  assert.ok(Math.abs(turn({ padSensitivity: 2 }) - base * 2) < 1e-9);
});

test('in menus the pad moves the focus instead (and never moves the player)', () => {
  const p = fakePad();
  const input = createInput({ target, doc: null, getPads: () => [p.pad] });
  const said = [];
  input.onPadMenu = (a) => said.push(a);
  p.set(13, true); // D-pad down
  input.pollPad(0.016);
  p.set(13, false);
  p.set(0, true); // A
  input.pollPad(0.016);
  p.set(0, false);
  p.set(1, true); // B
  input.pollPad(0.016);
  assert.deepEqual(said, ['down', 'accept', 'back']);
  p.axes([0, -1, 0, 0]);
  input.pollPad(0.016);
  assert.equal(input.sample().moveZ, 0);
});

test('no controller plugged in: nothing changes', () => {
  const input = createInput({ target, doc: null, getPads: () => [null, null] });
  input.enabled = true;
  input.pollPad(0.016);
  assert.equal(input.sample().moveZ, 0);
  assert.equal(input.device, 'keyboard');
});
