// The game's downloaded art: built by tools/, small enough for the web, and credited.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MANIFEST } from '../../src/render/assets.js';

/** The JSON part of a .glb file: what's inside, without needing a graphics card. */
function glbJson(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'glTF', `${file} is a binary glTF`);
  const length = b.readUInt32LE(12);
  return JSON.parse(b.toString('utf8', 20, 20 + length));
}

test('every model and texture the game asks for exists', () => {
  for (const kind of ['models', 'textures']) {
    for (const [name, file] of Object.entries(MANIFEST[kind])) assert.ok(fs.existsSync(`assets/${file}`), `${name}: assets/${file}`);
  }
});

test('the soldier has the clips and bones the animation code uses, and stays small', () => {
  const file = 'assets/models/soldier.glb';
  const j = glbJson(file);
  const clips = j.animations.map((a) => a.name);
  for (const c of ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'LayToIdle']) {
    assert.ok(clips.includes(c), `clip ${c}`);
  }
  const bones = new Set(j.nodes.map((n) => n.name));
  for (const b of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_r', 'lowerarm_r', 'hand_r',
    'upperarm_l', 'lowerarm_l', 'hand_l', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r']) {
    assert.ok(bones.has(b), `bone ${b} (render/character.js and render/ragdolls.js use it)`);
  }
  const kb = fs.statSync(file).size / 1024;
  assert.ok(kb < 2560, `soldier.glb is ${kb.toFixed(0)} KB (budget 2.5 MB)`);
});

test('CREDITS.md names where every asset folder came from', () => {
  const credits = fs.readFileSync('CREDITS.md', 'utf8');
  assert.match(credits, /Universal Animation Library/);
  assert.match(credits, /assets\/models\//);
});
