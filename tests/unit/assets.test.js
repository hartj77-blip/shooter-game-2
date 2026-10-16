// The game's downloaded art: built by tools/, small enough for the web, and credited.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { MANIFEST } from '../../src/render/assets.js';
import { GUN_MODELS, buildGun } from '../../src/render/gun-models.js';
import { WEAPONS } from '../../src/weapons/weapons-data.js';

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

test('every gun has a model with its points measured, and its moving parts', () => {
  const file = 'assets/models/guns.glb';
  const names = new Set(glbJson(file).nodes.map((n) => n.name));
  for (const id of Object.keys(WEAPONS)) {
    assert.ok(names.has(id), `guns.glb has ${id}`);
    const spec = GUN_MODELS[id];
    assert.ok(spec, `GUN_MODELS.${id}`);
    for (const p of ['grip', 'sight', 'muzzle', 'eject']) assert.equal(spec[p].length, 3, `${id}.${p}`);
    // The muzzle is in front of the grip, the sight above it.
    assert.ok(spec.muzzle[2] < spec.grip[2] && spec.sight[1] > spec.grip[1], `${id}: muzzle ahead, sight above`);
  }
  // The parts the viewmodel animates (render/viewmodel.js: mag, pump, slide).
  for (const part of ['carbine_mag', 'smg_mag', 'shotgun_pump', 'pistol_slide']) assert.ok(names.has(part), part);
  const kb = fs.statSync(file).size / 1024;
  assert.ok(kb < 700, `guns.glb is ${kb.toFixed(0)} KB (budget 700 KB)`);
});

test('a model gun is moved so its grip is the origin, and keeps its moving parts', () => {
  // A pretend guns.glb: a carbine with a magazine.
  const mesh = (name) => Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.8), new THREE.MeshStandardMaterial()), { name });
  const carbine = mesh('carbine');
  carbine.add(mesh('carbine_mag'));
  const scene = new THREE.Scene();
  scene.add(carbine);
  const spec = GUN_MODELS.carbine;
  const gun = buildGun(WEAPONS.carbine, { guns: { scene } });
  assert.equal(gun.kind, 'model');
  assert.ok(gun.parts.mag, 'the magazine can drop out');
  assert.deepEqual(gun.sight.toArray(), spec.sight.map((v, i) => v - spec.grip[i]));
  assert.deepEqual(gun.muzzle.toArray(), spec.muzzle.map((v, i) => v - spec.grip[i]));
  // Without models (or without this gun), the block-built gun, with the same points as before.
  const blocks = buildGun(WEAPONS.carbine);
  assert.equal(blocks.kind, 'blocks');
  assert.deepEqual(blocks.sight.toArray(), WEAPONS.carbine.model.sight);
  assert.equal(buildGun(WEAPONS.pistol, { guns: { scene } }).kind, 'blocks');
});

test('CREDITS.md names where every asset folder came from', () => {
  const credits = fs.readFileSync('CREDITS.md', 'utf8');
  assert.match(credits, /Universal Animation Library/);
  assert.match(credits, /Ultimate Gun Pack/);
  assert.match(credits, /assets\/models\//);
});
