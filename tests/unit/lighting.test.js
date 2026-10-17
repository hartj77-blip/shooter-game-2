// Lighting (world/lighting.js): how lit a spot is, and how that hides you from
// the enemies at night (ai/senses.js). By day, nothing changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHTING, createLighting, lightAt, flashlightOn, sightScale, noticeScale } from '../../src/world/lighting.js';
import { makeFight, enemy } from '../support/ai.js';

const SOUTH = Math.PI;
const lamp = { at: [0, 3.85, 0], radius: 9 };
const at = (x, z) => ({ x, y: 0, z });

test('by day everything is lit; at night only lamps, muzzle flashes and torches are', () => {
  const day = createLighting({}, { lamps: [lamp] });
  const night = createLighting({ night: true }, { lamps: [lamp] });
  assert.equal(lightAt(at(30, 0), day), 1);
  assert.equal(sightScale(1), 1, 'daylight leaves sight alone');
  assert.equal(noticeScale(1), 1);
  assert.equal(lightAt(at(30, 0), night), LIGHTING.night, 'moonlight away from the lamp');
  assert.equal(lightAt(at(1, 1), night), LIGHTING.lampBright, 'right under it');
  const edge = lightAt(at(7, 0), night);
  assert.ok(edge > LIGHTING.night && edge < LIGHTING.lampBright, `fading towards the edge (${edge})`);
  assert.equal(lightAt(at(9.5, 0), night), LIGHTING.night, 'beyond its radius');
  assert.equal(lightAt(at(30, 0), night, 0.1), LIGHTING.firing, 'just fired');
  assert.equal(lightAt(at(30, 0), night, 2), LIGHTING.night, '...but not for long');
  // The same answer every time (it's simulation, and the host and the tests rely on it).
  assert.equal(lightAt(at(5.3, -2.1), night), lightAt(at(5.3, -2.1), night));
});

test('an enemy\'s flashlight lights what\'s in front of them, not behind, and only at night', () => {
  const night = createLighting({ night: true }, { lamps: [] });
  const day = createLighting({}, { lamps: [] });
  const eye = { x: 0, y: 1.6, z: 0 };
  const yaw = 0; // facing north (-Z)
  assert.ok(flashlightOn(night, eye, yaw, at(0, -10)) > 0.5, 'ahead');
  assert.equal(flashlightOn(night, eye, yaw, at(0, 10)), 0, 'behind');
  assert.equal(flashlightOn(night, eye, yaw, at(8, -10)), 0, 'off to the side of the beam');
  assert.equal(flashlightOn(night, eye, yaw, at(0, -30)), 0, 'out of reach');
  assert.equal(flashlightOn(day, eye, yaw, at(0, -10)), 0, 'nobody uses a torch by day');
});

/** A guard 14 m north, held facing south; you 6 m to the side of their gaze (outside the torch's beam), or in it: awareness after `t` s. */
async function noticed({ night, lamp: withLamp = false, inBeam = false, t = 1.2 }) {
  const pieces = [enemy('rifleman', [0, 0, -14], { yaw: SOUTH })];
  if (withLamp) pieces.push({ type: 'lamp', at: [6, 0, 1], rotY: SOUTH });
  const f = await makeFight({ night, pieces, spawn: [inBeam ? 0 : 6, 0, 0] });
  // Hold their gaze south (a guard glancing about would swing the torch on and off you).
  f.run(t, {}, () => { f.e().motor.yaw = SOUTH; });
  return f.e().senses.awareness;
}

test('the same spot: noticed later at night than by day, sooner under a lamp or in a torch beam', async () => {
  const day = await noticed({ night: false });
  const dark = await noticed({ night: true });
  const underLamp = await noticed({ night: true, lamp: true });
  const inBeam = await noticed({ night: true, inBeam: true });
  assert.ok(day > 0.6, `by day they're nearly sure (${day.toFixed(2)})`);
  assert.ok(dark < day * 0.5, `in the dark much less (${dark.toFixed(2)} vs ${day.toFixed(2)})`);
  assert.ok(underLamp > dark * 1.5, `under a lamp, much more (${underLamp.toFixed(2)} vs ${dark.toFixed(2)})`);
  assert.ok(inBeam > dark * 1.5, `in their flashlight's beam, much more (${inBeam.toFixed(2)} vs ${dark.toFixed(2)})`);
});

test('at night, far enough off you aren\'t seen at all; by day you are', async () => {
  for (const [night, seen] of [[false, true], [true, false]]) {
    const f = await makeFight({ night, pieces: [enemy('rifleman', [0, 0, -40], { yaw: SOUTH })], spawn: [12, 0, 0] });
    f.run(1);
    assert.equal(f.e().senses.visible, seen, night ? 'night' : 'day');
  }
});
