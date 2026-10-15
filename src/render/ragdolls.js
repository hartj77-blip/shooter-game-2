// Ragdolls: when a soldier goes down, its body tumbles like a puppet with cut strings.
//
// The block soldier's parts (hips, torso, head, thighs, shins, arms, gun) each
// become a physics box, joined at the waist, neck, hips, knees and shoulders.
// Gravity and the push of the bullet do the rest. Knees only bend one way.
//
// Ragdolls live in their OWN physics world, a "pretend" copy that only holds
// the level's walls and floors. They're decoration: they can never block a
// bullet, trip you up, or make two co-op players' games disagree. The real
// simulation never knows they exist.

import * as THREE from 'three';
import { RAPIER, createPhysicsWorld } from '../world/physics.js';
import { buildLevel } from '../world/level.js';
import { groups } from '../world/groups.js';

const STEP = 1 / 60;
const MAX_RAGDOLLS = 10;
const RAG = groups(0x0002, 0x0001); // ragdoll parts touch the level, never each other

// How hard each gun pushes a body when it drops it (newton-seconds).
const PUSH = { carbine: 40, smg: 30, shotgun: 95, pistol: 28, dmr: 60 };

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

export function createRagdolls(scene, levelDef) {
  const world = createPhysicsWorld();
  buildLevel(levelDef, world); // just the shapes: no surfaces, no targets, no enemies
  const active = [];
  let acc = 0;

  /** Physics body for one part of the model, placed exactly where the part is now. */
  function bodyFor(group, vel) {
    const mesh = group.children.find((c) => c.isMesh);
    group.updateWorldMatrix(true, false);
    group.matrixWorld.decompose(tmpP, tmpQ, tmpS);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(tmpP.x, tmpP.y, tmpP.z)
        .setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w })
        .setLinvel(vel.x, vel.y, vel.z)
        .setLinearDamping(0.15)
        .setAngularDamping(1.6)
        .setCcdEnabled(true),
    );
    const box = mesh.geometry.boundingBox;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(Math.max(size.x / 2, 0.03), Math.max(size.y / 2, 0.03), Math.max(size.z / 2, 0.03))
        .setTranslation(centre.x, centre.y, centre.z)
        .setDensity(450)
        .setFriction(0.9)
        .setRestitution(0.05)
        .setCollisionGroups(RAG),
      body,
    );
    const copy = new THREE.Mesh(mesh.geometry, mesh.material);
    copy.castShadow = true;
    copy.receiveShadow = true;
    copy.position.copy(tmpP);
    copy.quaternion.copy(tmpQ);
    scene.add(copy);
    return { body, mesh: copy, matrix: group.matrixWorld.clone() };
  }

  /** A world point in a part's own space (for joint anchors). */
  function local(part, worldPoint) {
    tmpM.copy(part.matrix).invert();
    const p = worldPoint.clone().applyMatrix4(tmpM);
    return { x: p.x, y: p.y, z: p.z };
  }

  /**
   * Swap a soldier model for a ragdoll in the same pose.
   * @param {object} model  from buildSoldier()
   * @param {object} death  the enemy's death info: vel, point, dir, weapon, zone
   */
  function spawn(model, death) {
    const P = model.parts;
    model.root.updateMatrixWorld(true);
    const vel = death.vel ?? { x: 0, y: 0, z: 0 };
    const b = {};
    for (const name of ['hips', 'torso', 'head', 'thighL', 'shinL', 'thighR', 'shinR', 'armL', 'armR', 'gun']) b[name] = bodyFor(P[name], vel);

    const at = (group, offset = [0, 0, 0]) => group.localToWorld(new THREE.Vector3(...offset));
    const joint = (a, c, point, data) => {
      const j = world.createImpulseJoint(data(local(a, point), local(c, point)), a.body, c.body, true);
      j.setContactsEnabled(false);
      return j;
    };
    const ball = (a, c, point) => joint(a, c, point, (p1, p2) => RAPIER.JointData.spherical(p1, p2));
    const knee = (a, c, point) => {
      const j = joint(a, c, point, (p1, p2) => RAPIER.JointData.revolute(p1, p2, { x: 1, y: 0, z: 0 }));
      j.setLimits(-2.6, 0.05); // knees only fold backwards
      return j;
    };
    ball(b.hips, b.torso, at(P.torso));
    ball(b.torso, b.head, at(P.head));
    ball(b.hips, b.thighL, at(P.thighL));
    ball(b.hips, b.thighR, at(P.thighR));
    knee(b.thighL, b.shinL, at(P.shinL));
    knee(b.thighR, b.shinR, at(P.shinR));
    ball(b.torso, b.armL, at(P.aim, [-0.24, 0, 0]));
    ball(b.torso, b.armR, at(P.aim, [0.24, 0, 0]));
    // The gun just falls out of their hands.

    // The bullet's push, on the part it hit.
    if (death.point && death.dir) {
      const hit = new THREE.Vector3(death.point.x, death.point.y, death.point.z);
      const target = death.zone === 'head' ? b.head : Object.values(b)
        .filter((p) => p !== b.gun)
        .reduce((best, p) => (p.mesh.position.distanceTo(hit) < best.mesh.position.distanceTo(hit) ? p : best));
      const push = (PUSH[death.weapon] ?? 35) * (death.zone === 'head' ? 1.2 : 1);
      target.body.applyImpulseAtPoint({ x: death.dir.x * push, y: death.dir.y * push + push * 0.15, z: death.dir.z * push }, death.point, true);
    }

    model.root.visible = false;
    active.push({ parts: Object.values(b), age: 0 });
    while (active.length > MAX_RAGDOLLS) remove(active.shift());
  }

  function remove(r) {
    for (const p of r.parts) {
      world.removeRigidBody(p.body);
      scene.remove(p.mesh);
    }
  }

  return {
    get count() { return active.length; },
    spawn,
    /** Step the pretend world in small fixed steps, and move the meshes to match. */
    update(dt) {
      if (!active.length) return;
      acc = Math.min(acc + dt, STEP * 3);
      while (acc >= STEP) {
        world.step();
        acc -= STEP;
      }
      for (const r of active) {
        r.age += dt;
        for (const p of r.parts) {
          const t = p.body.translation();
          const q = p.body.rotation();
          p.mesh.position.set(t.x, t.y, t.z);
          p.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        }
      }
    },
    /** Remove every ragdoll (restarting a fight). */
    clear() {
      while (active.length) remove(active.pop());
    },
  };
}
