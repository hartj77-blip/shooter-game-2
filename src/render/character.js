// A soldier with a skeleton: the animated character that replaces the block
// soldier (render/soldier-model.js is still there, as the fallback).
//
// SKELETAL ANIMATION. The model (assets/models/soldier.glb, from Quaternius'
// CC0 animation library) is one stretchy skin wrapped around 65 "bones": an
// invisible skeleton, like the wire inside a plasticine figure. Move a bone and
// the skin around it follows ("skinning"). An animation CLIP is a recording of
// how every bone turns over a few seconds: a walk, a run, crouching.
//
// Each frame, the soldier's pose is built in layers, like a puppeteer working
// the legs while a second puppeteer works the arms:
//
//   1. LEGS from clips. An AnimationMixer plays several clips at once and
//      BLENDS them by weight: idle, walk, jog and sprint fade into each other as
//      the speed changes, standing and crouched fade by how crouched. Clips
//      play faster or slower to match the real speed, so feet don't slide.
//      Walking sideways or backwards: the hips turn towards where you're going
//      (up to 60°), and walking backwards plays the walk in reverse.
//   2. UPPER BODY by code. The pack has no rifle animations, so the spine bends
//      to aim up and down, the gun is held in front of the chest, and the hands
//      are put on it by TWO-BONE IK ("inverse kinematics"): given where a hand
//      must be, work out where the elbow goes. Like reaching for a cup: you
//      think about your hand, and your elbow sorts itself out.
//   3. REACTIONS on top: a flinch when hit (springs, in soldiers-view.js),
//      the reload (the left hand goes to the magazine), the grenade throw.
//
// The ragdoll (render/ragdolls.js) takes over the same bones when the soldier dies.
// Presentation only: it reads the soldier's `view` like the block soldier did,
// and offers the same things (root, muzzle, laser, parts.gun, pose()).

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildGun } from './gun-models.js';
import { flatten } from './merge.js';
import { addOutline } from './outline.js';
import { WEAPONS } from '../weapons/weapons-data.js';
import { withAttachments, SLOTS } from '../weapons/attachments.js';

// Fitting the model to the game: our hitboxes put the head at 1.6 m (player/hitboxes.js).
const SCALE = 1.0;
// The model faces +Z; our soldiers face -Z (north at yaw 0).
const TURN = Math.PI;

// How fast (m/s) each clip moves its feet, so a clip can be sped up to match the soldier.
const GAIT = { walk: 1.45, jog: 3.6, sprint: 6.2, crouchWalk: 1.3 };
const DEG = Math.PI / 180;
const CROUCH_DEPTH = 0.82;  // how much of the crouch clip to use (player/hitboxes.js has the head at 1.06 m crouched)
const SPINE_AIM = 0.5;      // how much of aiming up and down the spine does (the arms and gun do the rest)

const CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop',
  crouchIdle: 'Crouch_Idle_Loop', crouchWalk: 'Crouch_Fwd_Loop',
  lie: 'LayToIdle',
};

// How much bigger than the first pose's bounding ball a soldier's ball is (see frustum culling below).
const CULL_GROW = 2.2;

// Where the hands go on a gun, in the gun's own space (render/gun-models.js), and
// where the gun sits relative to the chest (character space: x right, y up, z forward is -).
const GRIP = new THREE.Vector3(0, -0.07, 0.02);
const HOLD = new THREE.Vector3(0.11, -0.04, -0.3);   // shouldered, aiming
const LOW = new THREE.Vector3(0.1, -0.22, -0.26);    // lowered, calm

/** Materials per colour scheme: the skin is one material for the body, one for the joints (gloves, boots). */
const materials = new Map();
function materialsFor(colors) {
  const key = JSON.stringify(colors);
  if (!materials.has(key)) {
    materials.set(key, {
      body: new THREE.MeshStandardMaterial({ color: colors.uniform, roughness: 0.8 }),
      joints: new THREE.MeshStandardMaterial({ color: colors.gloves, roughness: 0.75 }),
      gear: new THREE.MeshStandardMaterial({ color: colors.vest, roughness: 0.85 }),
      helmet: new THREE.MeshStandardMaterial({ color: colors.helmet, roughness: 0.7 }),
      accent: new THREE.MeshStandardMaterial({ color: colors.band, roughness: 0.6, emissive: colors.band, emissiveIntensity: 0.15 }),
      goggles: new THREE.MeshStandardMaterial({ color: colors.goggles, roughness: 0.3, emissive: colors.goggles, emissiveIntensity: 0.35 }),
    });
  }
  return materials.get(key);
}

// One flattened gun per weapon, kind (model or blocks) and set of attachments,
// shared by every soldier carrying that exact gun.
const gunGeometries = new Map();
function gunGeometry(weaponId, guns, attachments = {}) {
  const fitted = SLOTS.map((s) => attachments[s] ?? '').join(',');
  const key = `${weaponId}:${guns ? 'model' : 'blocks'}:${fitted}`;
  if (!gunGeometries.has(key)) {
    const model = buildGun(withAttachments(WEAPONS[weaponId], attachments), { hands: false, guns });
    gunGeometries.set(key, {
      geometry: flatten(model.group),
      muzzle: model.muzzle,
      laser: model.laser,
      support: model.support ?? new THREE.Vector3(-0.02, -0.09, 0.03),
    });
  }
  return gunGeometries.get(key);
}

// ---------------------------------------------------------------- bone helpers

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Turn a bone by `angle` about a direction in the world (the rest of the skeleton below it follows). */
function turnBone(bone, axis, angle) {
  if (!angle) return;
  bone.parent.getWorldQuaternion(_q2);
  const world = bone.getWorldQuaternion(_q);
  world.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  bone.quaternion.copy(_q2.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

/** Turn a bone so that the direction from it to `child` points along `dir` (world space). */
function aimBone(bone, child, dir) {
  const from = bone.getWorldPosition(new THREE.Vector3());
  const now = child.getWorldPosition(_v).sub(from).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(now, dir.clone().normalize());
  bone.parent.getWorldQuaternion(_q2);
  const world = bone.getWorldQuaternion(_q).premultiply(delta);
  bone.quaternion.copy(_q2.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

/**
 * TWO-BONE IK: put the end of upper → lower → hand at `target`, with the elbow
 * bending towards `pole`. The law of cosines gives the elbow's angle from the
 * three lengths (upper arm, forearm, shoulder-to-target), like working out a
 * triangle's corner from its sides.
 */
function reach(upper, lower, hand, target, pole) {
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = lower.getWorldPosition(new THREE.Vector3());
  const c = hand.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toT = target.clone().sub(a);
  const d = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  toT.normalize();
  // Angle at the shoulder between "towards the target" and "towards the elbow".
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const angA = Math.acos(Math.min(1, Math.max(-1, cosA)));
  // The elbow swings out towards the pole, in the plane of shoulder, target and pole.
  const side = pole.clone().sub(a);
  side.addScaledVector(toT, -side.dot(toT)).normalize();
  const elbow = a.clone()
    .addScaledVector(toT, Math.cos(angA) * l1)
    .addScaledVector(side, Math.sin(angA) * l1);
  aimBone(upper, lower, elbow.clone().sub(a));
  aimBone(lower, hand, target.clone().sub(lower.getWorldPosition(_v2)));
}

// ---------------------------------------------------------------- the character

/**
 * @param {object} opts
 * @param {object} opts.gltf    the loaded soldier model (render/assets.js)
 * @param {object} [opts.guns]  the loaded gun models (else block-built guns)
 * @param {string|null} opts.weapon  the gun they carry (null: unarmed, the hostage)
 * @param {object} [opts.attachments]  what's fitted to it (weapons/attachments.js), for teammates
 * @param {object} opts.colors  render/soldier-model.js SOLDIER_COLORS entry
 */
export function createCharacter({ gltf, guns = null, weapon, attachments = {}, colors }) {
  const root = new THREE.Group();
  const body = cloneSkinned(gltf.scene);
  body.scale.setScalar(SCALE);
  body.rotation.y = TURN;
  root.add(body);
  const mats = materialsFor(colors);
  // Two copies of the body ride the same skeleton: the full one, and a simpler
  // one (a quarter of the triangles) for far away. `detail()` shows one of them.
  const near = [], far = [];
  body.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.material = o.material.name === 'M_Joints' ? mats.joints : mats.body;
    o.castShadow = true;
    o.receiveShadow = true;
    // Skip drawing it when it's off screen ("frustum culling"). three.js judges
    // that with a ball around the mesh, but a skinned mesh's ball is worked out
    // once, in its first pose, and the animation moves it about. So: a ball well
    // big enough for any pose (lying down, arms out), around the first one.
    o.computeBoundingSphere();
    o.boundingSphere.radius *= CULL_GROW;
    (o.parent?.name.endsWith('_far') ? far : near).push(o);
  });
  for (const o of far) o.visible = false;
  let level = 0;
  // They all share one skeleton (the copy made a skeleton each): its bones are
  // worked out once a frame, not once per mesh.
  const skeleton = near[0].skeleton;
  for (const o of [...near, ...far]) {
    if (o.skeleton === skeleton) continue;
    o.skeleton.dispose();
    o.bind(skeleton, o.bindMatrix);
  }
  // A dark outline round the full body (render/outline.js; shown on medium and
  // high quality). Not the far one: an outline that far off is thinner than a pixel.
  const hulls = near.map(addOutline);
  const bone = (name) => body.getObjectByName(name);
  const B = {
    pelvis: bone('pelvis'), spine1: bone('spine_01'), spine2: bone('spine_02'), spine3: bone('spine_03'),
    neck: bone('neck_01'), head: bone('Head'),
    upperR: bone('upperarm_r'), lowerR: bone('lowerarm_r'), handR: bone('hand_r'),
    upperL: bone('upperarm_l'), lowerL: bone('lowerarm_l'), handL: bone('hand_l'),
    thighL: bone('thigh_l'), calfL: bone('calf_l'), thighR: bone('thigh_r'), calfR: bone('calf_r'),
  };

  // ---- gear: helmet, goggles, vest, pack and an arm band, made in code, riding on bones.
  // Each piece is placed where it belongs on the T-posed model, then handed to its bone,
  // keeping that place: so it moves with the bone from then on.
  body.updateMatrixWorld(true);
  const attach = (b, geometry, material, at, size) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    // `at` is in the model's own space (metres, facing +Z, T-posed): the body's
    // matrix takes it into the world, the bone's inverse takes it into the bone.
    const place = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion(), new THREE.Vector3(...(size ?? [1, 1, 1])));
    const toBody = body.matrixWorld.clone().multiply(place);
    m.matrix.copy(b.matrixWorld.clone().invert().multiply(toBody));
    m.matrix.decompose(m.position, m.quaternion, m.scale);
    b.add(m);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  if (weapon !== null) {
    attach(B.head, new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.helmet, [0, 1.69, 0.0], [1.05, 0.85, 1.12]);
    attach(B.head, box(0.18, 0.05, 0.04), mats.goggles, [0, 1.67, 0.12]);
    attach(B.spine3, box(0.36, 0.34, 0.26), mats.gear, [0, 1.25, 0.01]);   // plate carrier
    attach(B.spine3, box(0.27, 0.3, 0.1), mats.gear, [0, 1.3, -0.17]);     // pack
    attach(bone('upperarm_l'), box(0.12, 0.05, 0.12), mats.accent, [0.3, 1.44, -0.06]);
  }

  // ---- the gun, in the right hand's place but driven by code (it aims where the soldier aims)
  const gunPivot = new THREE.Group();
  root.add(gunPivot);
  let gunMesh = null, muzzle = new THREE.Object3D(), laser = null, support = new THREE.Vector3();
  if (weapon) {
    const g = gunGeometry(weapon, guns, attachments);
    gunMesh = new THREE.Mesh(g.geometry, gunMaterial());
    gunMesh.castShadow = true;
    gunMesh.position.copy(GRIP).negate(); // so the pivot is the grip
    gunPivot.add(gunMesh);
    muzzle.position.copy(g.muzzle).sub(GRIP);
    gunPivot.add(muzzle);
    if (g.laser) {
      laser = new THREE.Object3D();
      laser.position.copy(g.laser).sub(GRIP);
      gunPivot.add(laser);
    }
    support = g.support.clone().sub(GRIP);
  }

  // ---- clips
  const mixer = new THREE.AnimationMixer(body);
  const actions = {};
  for (const [key, name] of Object.entries(CLIPS)) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    a.play();
    a.setEffectiveWeight(0);
    actions[key] = a;
  }
  // Lying down: hold the first moment of "lay to idle" (it starts flat on the ground).
  if (actions.lie) { actions.lie.paused = true; actions.lie.time = 0.05; }

  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const target = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let reloadT = 0;

  /**
   * Pose the soldier for this frame.
   * @param {object} p
   * @param {number} p.dt       seconds since the last frame
   * @param {number} p.speed    ground speed, m/s
   * @param {number} p.heading  which way they're moving, relative to facing (radians, 0 = forward)
   * @param {number} p.crouch   0..1
   * @param {number} p.pitch    aim up (+) / down (-)
   * @param {number} p.ready    0 gun lowered .. 1 raised
   * @param {number} p.sprint   0..1
   * @param {number} p.reload   0..1
   * @param {number} p.lying    0..1 (downed)
   * @param {number} p.throwing 0..1 through a grenade throw (0: not throwing)
   * @param {boolean} [p.captive] tied up (the hostage, before they're freed)
   * @param {number} p.kick     recoil, metres back
   * @param {{x:number, z:number}} p.flinch  a jolt from being hit, radians
   */
  function pose(p) {
    const dt = p.dt ?? 0;
    // The crouch clip is a deep squat; most of the way there matches the crouched hitboxes (head at 1.06 m).
    const crouch = p.crouch * CROUCH_DEPTH, standing = 1 - crouch;
    const lying = p.lying ?? 0;
    const upright = 1 - lying;
    const sit = p.captive ? 1 : 0;
    const speed = p.speed ?? 0;
    let heading = p.heading ?? 0;
    const backwards = Math.abs(heading) > 100 * DEG && speed > 0.3;
    if (backwards) heading = Math.atan2(Math.sin(heading + Math.PI), Math.cos(heading + Math.PI));

    // 1. Legs: blend the gaits by speed.
    const w = { idle: 0, walk: 0, jog: 0, sprint: 0 };
    if (p.sprint > 0.5 && speed > 3) w.sprint = 1;
    else if (speed < GAIT.walk) { w.walk = speed / GAIT.walk; w.idle = 1 - w.walk; }
    else if (speed < GAIT.jog) { w.jog = (speed - GAIT.walk) / (GAIT.jog - GAIT.walk); w.walk = 1 - w.jog; }
    else w.jog = 1;
    const native = w.sprint ? GAIT.sprint : w.jog * GAIT.jog + w.walk * GAIT.walk + w.idle * GAIT.walk;
    const rate = speed > 0.15 ? Math.min(2, Math.max(0.5, speed / native)) : 1;
    const cw = Math.min(1, speed / GAIT.crouchWalk);
    const set = (k, weight, timeScale = 1) => {
      const a = actions[k];
      if (!a) return;
      a.enabled = weight > 0.001;
      a.setEffectiveWeight(weight);
      a.setEffectiveTimeScale(timeScale);
    };
    const live = upright * (1 - sit);
    set('idle', live * standing * w.idle);
    set('walk', live * standing * w.walk, (backwards ? -1 : 1) * rate);
    set('jog', live * standing * w.jog, (backwards ? -1 : 1) * rate);
    set('sprint', live * standing * w.sprint, rate);
    set('crouchIdle', live * crouch * (1 - cw));
    set('crouchWalk', live * crouch * cw, (backwards ? -1 : 1) * Math.min(2, Math.max(0.5, speed / GAIT.crouchWalk)));
    set('lie', lying, 0);
    if (sit) set('crouchIdle', upright); // tied up: crouched, hands behind the back (below)
    mixer.update(dt);
    root.updateWorldMatrix(true, true);

    if (lying > 0.5) { gunPivot.visible = false; return; }
    gunPivot.visible = !!weapon;

    // Hips turn towards where we're going; the spine turns back, so the chest still faces forward.
    const facing = root.getWorldQuaternion(tmpQ);
    const turn = Math.max(-60 * DEG, Math.min(60 * DEG, speed > 0.3 ? heading : 0));
    turnBone(B.pelvis, up, turn);
    turnBone(B.spine1, up, -turn);

    // 2. Upper body. Aim up and down with the spine, a third in each bone, plus the flinch.
    right.set(1, 0, 0).applyQuaternion(facing);
    fwd.set(0, 0, -1).applyQuaternion(facing);
    const aimPitch = weapon ? (p.pitch * p.ready) : 0;
    for (const b of [B.spine1, B.spine2, B.spine3]) {
      turnBone(b, right, (aimPitch * SPINE_AIM) / 3 + (p.flinch?.x ?? 0) / 3);
      turnBone(b, fwd, -(p.flinch?.z ?? 0) / 3);
    }

    if (!weapon) {
      // Unarmed (the hostage): arms swing with the clip; tied up, the hands go behind the back.
      if (sit) {
        B.pelvis.getWorldPosition(target).addScaledVector(fwd, 0.18).addScaledVector(up, 0.05);
        pole.copy(target).addScaledVector(fwd, 0.4).addScaledVector(right, 0.5);
        reach(B.upperR, B.lowerR, B.handR, target.clone().addScaledVector(right, 0.05), pole);
        pole.copy(target).addScaledVector(fwd, 0.4).addScaledVector(right, -0.5);
        reach(B.upperL, B.lowerL, B.handL, target.clone().addScaledVector(right, -0.05), pole);
      }
      return;
    }

    // The gun: in front of the chest, shouldered when ready, lowered when calm, across the chest when sprinting.
    B.spine3.getWorldPosition(chest);
    const hold = new THREE.Vector3().lerpVectors(LOW, HOLD, p.ready);
    gunPivot.position.copy(chest)
      .addScaledVector(right, hold.x - 0.06 * p.sprint)
      .addScaledVector(up, hold.y + 0.12 + 0.03 * crouch)
      .addScaledVector(fwd, -hold.z + (p.kick ?? 0));
    gunPivot.position.applyMatrix4(root.matrixWorld.clone().invert());
    euler.set(
      aimPitch - 0.55 * (1 - p.ready) - 0.35 * p.sprint,
      0.55 * p.sprint,
      0.45 * p.reload,
    );
    gunPivot.quaternion.setFromEuler(euler);
    gunPivot.updateMatrixWorld(true);

    // Hands on the gun. Reloading: the left hand drops to the magazine and back.
    reloadT = p.reload > 0.05 ? reloadT + dt : 0;
    gunPivot.localToWorld(target.set(0, 0, 0));
    pole.copy(chest).addScaledVector(right, 0.45).addScaledVector(up, -0.35).addScaledVector(fwd, -0.2);
    reach(B.upperR, B.lowerR, B.handR, target, pole);
    const left = support.clone();
    if (p.reload > 0.05) left.lerp(new THREE.Vector3(0, -0.2, -0.05), Math.abs(Math.sin(reloadT * 2.4)) * p.reload);
    if (p.throwing > 0) {
      // A grenade: the left hand leaves the gun, swings back past the head and forward.
      const t = p.throwing;
      const arc = new THREE.Vector3(-0.25, 0.35 + 0.15 * Math.sin(t * Math.PI), 0.25 - 0.9 * t);
      left.lerp(arc, Math.sin(Math.min(1, t * 1.3) * Math.PI));
    }
    gunPivot.localToWorld(target.copy(left));
    pole.copy(chest).addScaledVector(right, -0.45).addScaledVector(up, -0.4).addScaledVector(fwd, 0.1);
    reach(B.upperL, B.lowerL, B.handL, target, pole);
  }

  pose({ dt: 0, speed: 0, heading: 0, crouch: 0, pitch: 0, ready: 0, sprint: 0, reload: 0, lying: 0, throwing: 0, kick: 0, flinch: { x: 0, z: 0 } });

  return {
    kind: 'skinned',
    root,
    body,
    bones: B,
    parts: { gun: gunPivot },
    muzzle,
    laser,
    pose,
    /** What the ragdoll needs: the skeleton's bones by name. */
    bone,
    /** Level of detail: 0 the full body, 1 the simpler one (for far away). */
    detail(l) {
      if (l === level || !far.length) return;
      level = l;
      for (const o of [...near, ...hulls]) o.visible = l === 0;
      for (const o of far) o.visible = l === 1;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
      skeleton.dispose(); // its bone texture (render/dispose.js)
    },
  };
}

let sharedGunMaterial = null;
function gunMaterial() {
  sharedGunMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  return sharedGunMaterial;
}
