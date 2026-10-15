// The block soldier: a person built from boxes, animated by code.
//
// There are no animation files. Like a puppet, the soldier is a few parts on
// strings (three.js Groups nested inside each other, each turning around its
// own joint):
//
//   root (feet, turns to face the way the soldier faces)
//    └ hips ─┬ thigh L ─ shin L          legs swing with distance walked
//            ├ thigh R ─ shin R
//            └ torso ─┬ head             leans when crouching, flinches when hit
//                     └ aim ─┬ gun       follows the aim up and down, kicks on each shot
//                            ├ arm L
//                            └ arm R
//
// pose() sets every joint from a handful of numbers (stride, crouch, aim,
// readiness, sprint, reload, kick, flinch). That's "procedural animation".
// Sizes match the hitboxes in src/player/hitboxes.js, so what you see is what
// you hit.

import * as THREE from 'three';
import { buildGun } from './gun-models.js';
import { paintedBox, paintedLimb, mergeGeometries, flatten } from './merge.js';
import { WEAPONS } from '../weapons/weapons-data.js';

// Enemy colours: dark uniform, khaki plate carrier, warm red accents (art direction:
// enemies read warm, friends cool) and red-tinted goggles you can spot at range.
export const SOLDIER_COLORS = {
  enemy: {
    uniform: '#3a3d40', vest: '#6a5d48', pouch: '#54493a', helmet: '#2a2d2f', face: '#1d1f21',
    goggles: '#ff6a3d', band: '#d9542c', boots: '#1a1b1c', gloves: '#2b2b2b', pack: '#45403a',
  },
};

// Where the joints are (metres, standing).
const HIP_Y = 0.9;
const WAIST = 0.08;      // waist above the hip centre
const SHOULDER = 0.44;   // shoulders above the waist
const NECK = 0.5;
const THIGH = 0.42;
const SHIN = 0.38;
const LEG_X = 0.11;

/** A shared material: every soldier part paints its own colours (vertex colours). */
let sharedMaterial = null;
export function soldierMaterial() {
  sharedMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  return sharedMaterial;
}

const geometryCache = new Map();

/** The painted shapes for each body part (built once per weapon and colour scheme, then shared). */
function partGeometries(weaponId, colors) {
  const key = `${weaponId}:${JSON.stringify(colors)}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const c = colors;
  const def = WEAPONS[weaponId];
  const grip = [0.13, -0.05, -0.2]; // where the gun sits relative to the shoulders
  const gunModel = buildGun(def, { hands: false });
  const gun = flatten(gunModel.group);
  gun.translate(...grip);
  const hand = (p) => [p[0] + grip[0], p[1] + grip[1], p[2] + grip[2]];
  const rightHand = hand([0, -0.07, 0.02]);
  const leftHand = def.model.support ? hand([def.model.support[0], def.model.support[1] - 0.03, def.model.support[2]]) : hand([-0.02, -0.09, 0.03]);

  const g = {
    hips: mergeGeometries([
      paintedBox([0.36, 0.2, 0.24], [0, 0, 0], c.uniform),
      paintedBox([0.38, 0.06, 0.26], [0, 0.08, 0], c.vest),
      paintedBox([0.1, 0.1, 0.06], [0.16, 0.0, -0.13], c.pouch),
    ]),
    thigh: mergeGeometries([paintedBox([0.17, THIGH, 0.19], [0, -THIGH / 2, 0], c.uniform), paintedBox([0.18, 0.12, 0.2], [0, -THIGH + 0.02, -0.005], c.pouch)]),
    shin: mergeGeometries([
      paintedBox([0.15, SHIN, 0.16], [0, -SHIN / 2, 0], c.uniform),
      paintedBox([0.16, 0.1, 0.26], [0, -SHIN + 0.0, -0.04], c.boots),
    ]),
    torso: mergeGeometries([
      paintedBox([0.46, 0.5, 0.27], [0, 0.25, 0], c.uniform),
      paintedBox([0.5, 0.4, 0.31], [0, 0.24, 0], c.vest),
      paintedBox([0.1, 0.13, 0.07], [-0.14, 0.15, -0.18], c.pouch),
      paintedBox([0.1, 0.13, 0.07], [0, 0.15, -0.18], c.pouch),
      paintedBox([0.1, 0.13, 0.07], [0.14, 0.15, -0.18], c.pouch),
      paintedBox([0.32, 0.3, 0.13], [0, 0.28, 0.21], c.pack),
      paintedBox([0.04, 0.12, 0.04], [0.11, 0.48, 0.24], c.boots), // radio antenna base
    ]),
    head: mergeGeometries([
      paintedBox([0.22, 0.22, 0.24], [0, 0.11, 0], c.face),
      paintedBox([0.27, 0.12, 0.29], [0, 0.22, 0.01], c.helmet),
      paintedBox([0.27, 0.04, 0.06], [0, 0.17, -0.14], c.helmet),
      paintedBox([0.2, 0.06, 0.04], [0, 0.12, -0.125], c.goggles),
      paintedBox([0.06, 0.08, 0.05], [0.13, 0.12, 0.0], c.pack), // headset
    ]),
    gun,
    // Arms are fixed in the "aim" space: shoulder to elbow to the hand on the gun.
    armR: mergeGeometries([
      paintedLimb([0.24, 0, 0.0], [0.24, -0.2, -0.06], [0.12, 0.12], c.uniform),
      paintedLimb([0.24, -0.2, -0.06], rightHand, [0.1, 0.1], c.uniform),
      paintedBox([0.08, 0.08, 0.1], rightHand, c.gloves),
    ]),
    armL: mergeGeometries([
      paintedLimb([-0.24, 0, 0.0], [-0.16, -0.17, -0.28], [0.12, 0.12], c.uniform),
      paintedBox([0.13, 0.05, 0.13], [-0.22, -0.06, -0.09], c.band),
      paintedLimb([-0.16, -0.17, -0.28], leftHand, [0.1, 0.1], c.uniform),
      paintedBox([0.08, 0.08, 0.1], leftHand, c.gloves),
    ]),
    muzzle: new THREE.Vector3(...def.model.muzzle).add(new THREE.Vector3(...grip)),
    laser: (() => {
      const part = def.model.parts.find((p) => p.name === 'laser');
      return part ? new THREE.Vector3(...part.at).add(new THREE.Vector3(...grip)) : null;
    })(),
  };
  geometryCache.set(key, g);
  return g;
}

/**
 * Builds one soldier.
 * @param {{weapon:string, colors?:object}} opts
 */
export function buildSoldier({ weapon, colors = SOLDIER_COLORS.enemy }) {
  const geo = partGeometries(weapon, colors);
  const mat = soldierMaterial();
  const mesh = (g, name) => {
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const group = (name, parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  const root = new THREE.Group();
  const hips = group('hips', root, 0, HIP_Y, 0);
  hips.add(mesh(geo.hips, 'hips'));
  const thighL = group('thighL', hips, -LEG_X, -0.05, 0);
  thighL.add(mesh(geo.thigh, 'thighL'));
  const shinL = group('shinL', thighL, 0, -THIGH, 0);
  shinL.add(mesh(geo.shin, 'shinL'));
  const thighR = group('thighR', hips, LEG_X, -0.05, 0);
  thighR.add(mesh(geo.thigh, 'thighR'));
  const shinR = group('shinR', thighR, 0, -THIGH, 0);
  shinR.add(mesh(geo.shin, 'shinR'));
  const torso = group('torso', hips, 0, WAIST, 0);
  torso.add(mesh(geo.torso, 'torso'));
  const head = group('head', torso, 0, NECK, 0);
  head.add(mesh(geo.head, 'head'));
  const aim = group('aim', torso, 0, SHOULDER, 0);
  const gun = group('gun', aim);
  gun.add(mesh(geo.gun, 'gun'));
  const armL = group('armL', aim);
  armL.add(mesh(geo.armL, 'armL'));
  const armR = group('armR', aim);
  armR.add(mesh(geo.armR, 'armR'));
  const muzzle = group('muzzle', gun, geo.muzzle.x, geo.muzzle.y, geo.muzzle.z);
  const laser = geo.laser ? group('laser', gun, geo.laser.x, geo.laser.y, geo.laser.z) : null;

  const parts = { hips, thighL, shinL, thighR, shinR, torso, head, aim, gun, armL, armR };

  /**
   * Sets every joint. All inputs are plain numbers, smoothed by the caller.
   * @param {object} p
   * @param {number} p.stride   walk cycle, radians (grows with distance walked)
   * @param {number} p.swing    how big the steps are (0 standing still, 1 running)
   * @param {number} p.crouch   0 standing, 1 crouched
   * @param {number} p.pitch    aim up (+) or down (-), radians
   * @param {number} p.ready    0 gun lowered (calm), 1 raised to aim
   * @param {number} p.sprint   0..1 gun across the chest
   * @param {number} p.reload   0..1 reloading tilt
   * @param {number} p.kick     recoil, metres the gun is pushed back
   * @param {{x:number, z:number}} p.flinch  a jolt from being hit, radians
   */
  function pose(p) {
    const swing = p.swing * (1 - p.crouch * 0.6);
    const s = Math.sin(p.stride);
    const lift = (phase) => Math.max(0, Math.sin(phase)); // bend the knee on the forward swing
    // Standing to crouched: hips drop, thighs come forward, shins fold back, body leans in.
    const thighBase = 1.25 * p.crouch;
    const shinBase = -2.25 * p.crouch;
    hips.position.y = HIP_Y - 0.44 * p.crouch - Math.abs(Math.cos(p.stride)) * 0.035 * swing;
    hips.position.z = 0.08 * p.crouch;
    thighL.rotation.x = thighBase + s * 0.55 * swing;
    thighR.rotation.x = thighBase - s * 0.55 * swing;
    shinL.rotation.x = shinBase - lift(p.stride + 0.6) * 0.9 * swing;
    shinR.rotation.x = shinBase - lift(p.stride + 0.6 + Math.PI) * 0.9 * swing;
    torso.rotation.x = -0.5 * p.crouch - 0.12 * swing + p.flinch.x;
    torso.rotation.z = p.flinch.z;
    torso.rotation.y = s * 0.06 * swing;
    head.rotation.x = 0.5 * p.crouch * 0.8 - Math.max(-0.4, Math.min(0.4, p.pitch * 0.4));
    // The gun: lowered when calm, raised to aim, across the chest when sprinting.
    const lowered = -0.6 * (1 - p.ready);
    aim.rotation.x = (p.pitch + 0.5 * p.crouch * 0.8) * p.ready + lowered - 0.35 * p.sprint;
    aim.rotation.y = 0.55 * p.sprint;
    aim.rotation.z = 0.45 * p.reload;
    aim.position.z = p.kick;
    aim.position.y = SHOULDER - 0.05 * p.reload;
  }

  pose({ stride: 0, swing: 0, crouch: 0, pitch: 0, ready: 0, sprint: 0, reload: 0, kick: 0, flinch: { x: 0, z: 0 } });

  return { root, parts, muzzle, laser, pose, geometries: geo };
}
