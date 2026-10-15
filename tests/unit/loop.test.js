// Game loop tests: the "bucket of time" maths from docs/lessons/01-the-game-loop.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, SIM_DT, MAX_STEPS_PER_FRAME, MAX_FRAME_TIME } from '../../src/core/loop.js';

test('a 60 Hz frame runs exactly one tick', () => {
  const r = advance(0, SIM_DT);
  assert.equal(r.steps, 1);
  assert.ok(r.acc < 1e-9);
});

test('a 144 Hz screen runs about 60 ticks per second in total', () => {
  let acc = 0;
  let steps = 0;
  for (let i = 0; i < 144; i++) {
    const r = advance(acc, 1 / 144);
    acc = r.acc;
    steps += r.steps;
  }
  assert.ok(Math.abs(steps - 60) <= 1, `got ${steps} ticks`);
});

test('leftover time becomes alpha, between 0 and 1', () => {
  const r = advance(0, SIM_DT * 1.5);
  assert.equal(r.steps, 1);
  assert.ok(Math.abs(r.alpha - 0.5) < 1e-6);
});

test('a huge frame (the tab was hidden) is capped', () => {
  const r = advance(0, 30);
  assert.ok(r.steps <= MAX_STEPS_PER_FRAME);
  assert.ok(r.steps * SIM_DT <= MAX_FRAME_TIME + 1e-9);
  assert.ok(r.acc < SIM_DT, 'the backlog is dropped, not saved up');
});

test('negative time (clock weirdness) does nothing', () => {
  const r = advance(0, -1);
  assert.equal(r.steps, 0);
  assert.equal(r.acc, 0);
});
