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
