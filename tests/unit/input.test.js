// Input tests: key presses become the right commands (docs/lessons/04-commands-events-and-states.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../../src/core/input.js';

function setup(settings = {}) {
  const target = new EventTarget();
  const input = createInput({ target, doc: { pointerLockElement: null }, settings });
  input.enabled = true;
  const key = (type, code, extra = {}) => target.dispatchEvent(Object.assign(new Event(type), { code, ...extra }));
  return { input, target, down: (c) => key('keydown', c), up: (c) => key('keyup', c), key };
}

test('WASD becomes movement', () => {
  const { input, down } = setup();
  down('KeyW');
  down('KeyD');
  const cmd = input.sample();
  assert.equal(cmd.moveZ, 1);
  assert.equal(cmd.moveX, 1);
});

test('arrow keys work too, and opposite keys cancel out', () => {
  const { input, down } = setup();
  down('ArrowUp');
  down('KeyS');
  assert.equal(input.sample().moveZ, 0);
});

test('a quick tap of jump is never missed, even if released before the next tick', () => {
  const { input, down, up } = setup();
  down('Space');
  up('Space');
  const cmd = input.sample();
  assert.equal(cmd.jump, true);
  assert.equal(cmd.jumpHeld, false);
  assert.equal(input.sample().jump, false, 'only counts once');
});

test('held keys repeating do not count as new presses', () => {
  const { input, down, key } = setup();
  down('Space');
  input.sample();
  key('keydown', 'Space', { repeat: true });
  assert.equal(input.sample().jump, false);
});

test('losing focus releases every key', () => {
  const { input, down, target } = setup();
  down('KeyW');
  target.dispatchEvent(new Event('blur'));
  assert.equal(input.sample().moveZ, 0);
});

test('nothing happens while input is disabled (in menus)', () => {
  const { input, down } = setup();
  input.enabled = false;
  down('KeyW');
  input.enabled = true;
  assert.equal(input.sample().moveZ, 0);
});

test('toggle crouch: one press to crouch, another to stand', () => {
  const { input, down, up } = setup({ crouchMode: 'toggle' });
  down('KeyC'); up('KeyC');
  assert.equal(input.sample().crouch, true);
  down('KeyC'); up('KeyC');
  assert.equal(input.sample().crouch, false);
});

test('hold crouch: crouched only while the key is down', () => {
  const { input, down, up } = setup({ crouchMode: 'hold' });
  down('KeyC');
  assert.equal(input.sample().crouch, true);
  up('KeyC');
  assert.equal(input.sample().crouch, false);
});

// ---------------------------------------------------------------- weapons input (milestone 2)

function mouse(target, type, button) {
  target.dispatchEvent(Object.assign(new Event(type), { button }));
}

test('left mouse fires, right mouse aims (hold mode)', () => {
  const { input, target } = setup({ aimMode: 'hold' });
  input.requireLock = false;
  mouse(target, 'mousedown', 0);
  mouse(target, 'mousedown', 2);
  let cmd = input.sample();
  assert.equal(cmd.fire, true);
  assert.equal(cmd.firePressed, true);
  assert.equal(cmd.ads, true);
  cmd = input.sample();
  assert.equal(cmd.firePressed, false, 'a click counts once');
  assert.equal(cmd.fire, true, 'still held');
  mouse(target, 'mouseup', 2);
  assert.equal(input.sample().ads, false);
});

test('a click shorter than one tick still fires', () => {
  const { input, target } = setup();
  input.requireLock = false;
  mouse(target, 'mousedown', 0);
  mouse(target, 'mouseup', 0);
  const cmd = input.sample();
  assert.equal(cmd.fire, true);
  assert.equal(cmd.firePressed, true);
});

test('mouse buttons are ignored until the pointer is captured', () => {
  const { input, target } = setup();
  mouse(target, 'mousedown', 0);
  assert.equal(input.sample().fire, false);
});

test('aim toggle: one click to aim, another to stop; sprinting cancels it', () => {
  const { input, target, down } = setup({ aimMode: 'toggle' });
  input.requireLock = false;
  mouse(target, 'mousedown', 2); mouse(target, 'mouseup', 2);
  assert.equal(input.sample().ads, true);
  down('ShiftLeft');
  assert.equal(input.sample().ads, false);
});

test('number keys pick a gun, R reloads, Q swaps back, the wheel cycles', () => {
  const { input, target, down } = setup();
  input.requireLock = false;
  down('Digit3');
  down('KeyR');
  let cmd = input.sample();
  assert.equal(cmd.slot, 3);
  assert.equal(cmd.reload, true);
  down('KeyQ');
  assert.equal(input.sample().lastWeapon, true);
  target.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: 120 }));
  cmd = input.sample();
  assert.equal(cmd.cycle, 1);
  assert.equal(input.sample().cycle, 0, 'one step per wheel click');
});

import { cleanKeys, bindingsWith, keyName } from '../../src/core/input.js';
import { createSettings } from '../../src/core/settings.js';

test('your own keys: one key per action, only real actions and keys, Escape and ` stay reserved', () => {
  assert.deepEqual(cleanKeys({ interact: 'KeyE', fly: 'KeyX', reload: 'Escape', jump: '<b>', ping: 42 }), { interact: 'KeyE' });
  assert.deepEqual(cleanKeys('rubbish'), {});
  const b = bindingsWith({ interact: 'KeyE', reload: 'KeyF' });
  assert.deepEqual(b.interact, ['KeyE']);
  assert.deepEqual(b.reload, ['KeyF']);
  for (const [action, codes] of Object.entries(b)) if (action !== 'reload') assert.ok(!codes.includes('KeyF'), `${action} lost F`);
  assert.equal(keyName('KeyF'), 'F');
  assert.equal(keyName('Mouse0'), 'Click');
  assert.equal(keyName('ShiftLeft'), 'Shift');
  assert.equal(keyName('ArrowUp'), '↑');
});

test('a rebound key drives its new action, prompts follow it, and the choice is saved', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const settings = createSettings(storage);
  settings.set('keys', { interact: 'KeyE' });
  assert.deepEqual(createSettings(storage).values.keys, { interact: 'KeyE' }, 'remembered');
  const target = new EventTarget();
  const input = createInput({ target, doc: { pointerLockElement: null }, settings: settings.values, getPads: () => [] });
  input.enabled = true;
  assert.equal(input.glyph('interact'), 'E');
  const key = (type, code) => { const e = new Event(type); e.code = code; target.dispatchEvent(e); };
  key('keydown', 'KeyE');
  assert.equal(input.sample().interact, true);
  key('keyup', 'KeyE');
  key('keydown', 'KeyF');
  assert.equal(input.sample().interact, false, 'F does nothing now');
  input.applyKeys({});
  assert.equal(input.glyph('interact'), 'F', 'back to the default');
});

test('touch controls press the same actions as keys (ui/touch.js)', () => {
  const { input } = setup();
  input.touch.move(0, 1);
  input.touch.press('jump');
  const c = input.sample();
  assert.equal(c.moveZ, 1);
  assert.equal(c.jump, true);
  input.touch.press('fire');
  assert.equal(input.sample().fire, true);
  input.touch.release('fire');
  input.touch.move(0, 0);
  const d = input.sample();
  assert.equal(d.fire, false);
  assert.equal(d.moveZ, 0);
  const yaw = input.yaw;
  input.touch.look(0.1, 0);
  assert.ok(input.yaw < yaw, 'dragging right turns right');
});
