// Tests for the small core pieces: settings, events, state machine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, defaultSettings } from '../../src/core/settings.js';
import { createEvents } from '../../src/core/events.js';
import { createStateMachine } from '../../src/core/fsm.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

test('settings start at their defaults', () => {
  const s = createSettings(fakeStorage());
  assert.deepEqual(s.values, defaultSettings());
});

test('settings are saved and loaded again', () => {
  const storage = fakeStorage();
  createSettings(storage).set('fov', 90);
  assert.equal(createSettings(storage).values.fov, 90);
});

test('bad saved values fall back to defaults, good ones are kept', () => {
  const storage = fakeStorage({
    'fireteam.settings': JSON.stringify({ version: 1, values: { fov: 'wide', sensitivity: 999, invertY: true, quality: 'ultra' } }),
  });
  const s = createSettings(storage);
  assert.equal(s.values.fov, 100, 'not a number: default');
  assert.equal(s.values.sensitivity, 10, 'too big: clamped to the maximum');
  assert.equal(s.values.invertY, true, 'valid: kept');
  assert.equal(s.values.quality, 'high', 'unknown option: default');
});

test('a corrupt save never stops the game from starting', () => {
  const s = createSettings(fakeStorage({ 'fireteam.settings': '{not json' }));
  assert.deepEqual(s.values, defaultSettings());
});

test('no storage at all (private browsing) still works', () => {
  const s = createSettings(null);
  s.set('fov', 80);
  assert.equal(s.values.fov, 80);
});

test('events reach every listener, and listeners can stop listening', () => {
  const bus = createEvents();
  const heard = [];
  const stop = bus.on('ping', (d) => heard.push(`a${d}`));
  bus.on('ping', (d) => heard.push(`b${d}`));
  bus.emit('ping', 1);
  stop();
  bus.emit('ping', 2);
  assert.deepEqual(heard, ['a1', 'b1', 'b2']);
});

test('the state machine runs exit and enter in order, and only for real changes', () => {
  const log = [];
  const fsm = createStateMachine({
    title: { enter: () => log.push('enter title'), exit: () => log.push('exit title') },
    playing: { enter: () => log.push('enter playing') },
  });
  fsm.go('title');
  fsm.go('title');
  fsm.go('playing');
  assert.deepEqual(log, ['enter title', 'exit title', 'enter playing']);
  assert.ok(fsm.is('playing'));
  assert.throws(() => fsm.go('nowhere'));
});
