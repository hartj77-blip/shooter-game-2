// Voice chat mixing rules (src/net/voice-mix.js; docs/lessons/13-voice-rooms-and-the-internet.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceMix, micOpen, VOICE } from '../../src/net/voice-mix.js';

test('the radio reaches everyone at full volume, wherever they are, and never as nearby voice', () => {
  for (const distance of [null, 0, 10, 500]) {
    assert.deepEqual(voiceMix({ mode: 'both', radio: true, distance }), { radio: 1, near: 0 });
  }
});

test('nearby voice: full volume close by, fading with distance, silent beyond range', () => {
  const at = (distance) => voiceMix({ mode: 'both', distance }).near;
  assert.equal(at(1), 1);
  assert.equal(at(VOICE.full), 1);
  assert.ok(at(10) < 1 && at(10) > at(20), 'fades');
  assert.equal(at(VOICE.range), 0);
  assert.equal(at(100), 0);
  assert.equal(voiceMix({ mode: 'both', distance: 10 }).radio, 0, 'no radio crackle on nearby voice');
  assert.equal(voiceMix({ mode: 'both', distance: null }).near, 1, 'in the lobby, everyone is close');
});

test('muting someone, or turning voice off, silences them both ways', () => {
  assert.deepEqual(voiceMix({ mode: 'both', muted: true, radio: true }), { radio: 0, near: 0 });
  assert.deepEqual(voiceMix({ mode: 'off', radio: true, distance: 1 }), { radio: 0, near: 0 });
});

test('the voice volume setting scales everything', () => {
  assert.deepEqual(voiceMix({ mode: 'both', radio: true, volume: 0.5 }), { radio: 0.5, near: 0 });
  assert.equal(voiceMix({ mode: 'radio', distance: 2, volume: 0.25 }).near, 0.25);
});

test('your mic: always open for nearby voice, only while holding V in push-to-talk, never when off', () => {
  assert.equal(micOpen({ mode: 'both', radioHeld: false }), true);
  assert.equal(micOpen({ mode: 'radio', radioHeld: false }), false);
  assert.equal(micOpen({ mode: 'radio', radioHeld: true }), true);
  assert.equal(micOpen({ mode: 'off', radioHeld: true }), false);
});
