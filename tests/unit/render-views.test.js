// Presentation helpers that can be checked without a screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewForEvent } from '../../src/render/soldiers-view.js';

test('a teammate who bleeds out is found by their slot, so they fall as a ragdoll (regression)', () => {
  const views = new Map([
    ['e3', { id: 'e3', owner: 'e3' }],
    ['p1', { id: 'p1', owner: 1 }],
  ]);
  // 'player:dead' only says whose slot it was.
  assert.equal(viewForEvent(views, { owner: 1 })?.id, 'p1');
  // 'enemy:down' names the soldier.
  assert.equal(viewForEvent(views, { id: 'e3', owner: 'e3' })?.id, 'e3');
  assert.equal(viewForEvent(views, { owner: 2 }), null);
  assert.equal(viewForEvent(views, {}), null);
});

import { MOODS, moodFor } from '../../src/render/moods.js';
import provingGround from '../../levels/proving-ground.js';
import compound from '../../levels/compound.js';
import harbour from '../../levels/harbour.js';

test('every map has a mood, and every mood says everything the renderer needs', () => {
  const keys = ['skyTop', 'skyHorizon', 'fog', 'fogNear', 'fogFar', 'sun', 'sunIntensity', 'hemiSky', 'hemiGround', 'hemiIntensity', 'exposure', 'grade'];
  for (const [name, m] of Object.entries(MOODS)) {
    for (const k of keys) assert.ok(m[k] !== undefined, `${name}.${k}`);
    assert.ok(m.fogNear < m.fogFar, `${name}: fog starts before it ends`);
    for (const k of ['saturation', 'contrast', 'tint', 'vignette']) assert.ok(m.grade[k] !== undefined, `${name}.grade.${k}`);
  }
  for (const level of [provingGround, compound, harbour]) {
    assert.ok(MOODS[level.mood], `${level.name} names a mood that exists (${level.mood})`);
    assert.equal(moodFor(level), MOODS[level.mood]);
  }
  // A level can change one thing about its mood.
  assert.equal(moodFor({ mood: { name: 'golden', fogFar: 99 } }).fogFar, 99);
  assert.equal(moodFor({ mood: { name: 'golden', fogFar: 99 } }).sun, MOODS.golden.sun);
});
