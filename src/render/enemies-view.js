// Drawing the enemies: block soldiers that follow the simulation.
//
// For each enemy this reads its state (where it is, which way it faces, how
// fast it moves, crouched or not, aiming or not, reloading, its brain's alert
// level) and poses its block soldier to match. It never changes the
// simulation. Extras:
//   - muzzle flashes and tracers from their guns (so you see where fire comes from)
//   - the Marksman's laser, brightening as its shot gets closer
//   - a "?" over someone suspicious, a "!" over someone who's just spotted you
//   - the ragdoll handover when they go down (render/ragdolls.js)
//
// Springs (gun kick, hit flinch) are stepped in small fixed steps (see lesson 6).

import * as THREE from 'three';
import { buildSoldier } from './soldier-model.js';
import { RAPIER } from '../world/physics.js';
import { BULLET } from '../world/groups.js';

const SUB = 1 / 240;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

function iconTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 104px "Barlow Condensed", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 14;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, 64, 70);
  g.fillStyle = color;
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {object} opts.enemies   ai/enemies.js
 * @param {object} opts.effects   render/effects.js (tracers, muzzle light)
 * @param {object} opts.ragdolls  render/ragdolls.js
 * @param {object} opts.world     the physics world (read-only: where the laser lands)
 * @param {THREE.Camera} opts.camera
 * @param {object} opts.events
 */
export function createEnemiesView({ scene, enemies, effects, ragdolls, world, camera, events }) {
  const group = new THREE.Group();
  group.name = 'enemies';
  scene.add(group);
  const views = new Map(); // enemy -> view

  const icons = {
    suspicious: new THREE.SpriteMaterial({ map: iconTexture('?', '#e8b14a'), depthTest: false, transparent: true }),
    spotted: new THREE.SpriteMaterial({ map: iconTexture('!', '#ff5a3c'), depthTest: false, transparent: true }),
  };
  const flashMat = new THREE.SpriteMaterial({ map: iconTexture('✸', '#ffd68a'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const laserMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const laserGeo = new THREE.BoxGeometry(0.012, 0.012, 1).translate(0, 0, -0.5);
  const dotMat = new THREE.SpriteMaterial({ map: iconTexture('●', '#ff2a1a'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function viewFor(e) {
    const model = buildSoldier({ weapon: e.def.weapon });
    group.add(model.root);
    const icon = new THREE.Sprite(icons.suspicious);
    icon.visible = false;
    icon.renderOrder = 10;
    group.add(icon);
    const flash = new THREE.Sprite(flashMat);
    flash.visible = false;
    flash.scale.setScalar(0.35);
    group.add(flash);
    let laser = null, dot = null;
    if (model.laser) {
      laser = new THREE.Mesh(laserGeo, laserMat.clone());
      laser.visible = false;
      laser.frustumCulled = false;
      dot = new THREE.Sprite(dotMat);
      dot.visible = false;
      dot.scale.setScalar(0.12);
      group.add(laser, dot);
    }
    const v = {
      e, model, icon, flash, laser, dot,
      yaw: e.motor.yaw,
      stride: 0, swing: 0, crouch: 0, ready: 0, sprint: 0, reload: 0,
      kick: 0, kickVel: 0,
      flinch: { x: 0, z: 0 }, flinchVel: { x: 0, z: 0 },
      flashTime: 0, spottedAt: -Infinity, wasCombat: false,
      last: new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z),
      dead: false,
    };
    views.set(e, v);
    return v;
  }

  function build() {
    for (const v of views.values()) {
      group.remove(v.model.root, v.icon, v.flash);
      if (v.laser) group.remove(v.laser, v.dot);
    }
    views.clear();
    for (const e of enemies.list) viewFor(e);
  }
  build();

  const byOwner = (owner) => {
    for (const v of views.values()) if (v.e.owner === owner) return v;
    return null;
  };

  events.on('weapon:fire', (ev) => {
    const v = byOwner(ev.owner);
    if (!v || v.dead) return;
    v.kickVel -= 1.6;
    v.flashTime = 0.05;
    const muzzle = v.model.muzzle.getWorldPosition(new THREE.Vector3());
    effects.muzzleLight(muzzle);
    for (const s of ev.shots) if (s.tracer) effects.tracer(muzzle, s.end);
  });
  events.on('target:hit', (ev) => {
    const v = views.get(ev.target);
    if (!v) return;
    const k = Math.min(1, ev.damage / 30);
    v.flinchVel.x += (Math.random() < 0.5 ? -1 : 1) * 3 * k - 4 * k;
    v.flinchVel.z += (Math.random() * 2 - 1) * 5 * k;
  });
  events.on('enemy:down', (ev) => {
    const v = views.get(ev.enemy);
    if (!v || v.dead) return;
    v.dead = true;
    v.icon.visible = false;
    if (v.laser) { v.laser.visible = false; v.dot.visible = false; }
    ragdolls.spawn(v.model, ev);
  });

  function update(dt, alpha) {
    for (const v of views.values()) {
      const e = v.e;
      if (v.dead) continue;
      const s = e.soldier.state;
      const prev = e.soldier.body.prev;
      const root = v.model.root;
      root.position.set(prev.x + (s.pos.x - prev.x) * alpha, prev.y + (s.pos.y - prev.y) * alpha, prev.z + (s.pos.z - prev.z) * alpha);
      v.yaw += wrap(e.motor.yaw - v.yaw) * (1 - Math.exp(-18 * dt));
      root.rotation.y = v.yaw;

      // How far it walked this frame drives the stride.
      const moved = Math.hypot(root.position.x - v.last.x, root.position.z - v.last.z);
      v.last.copy(root.position);
      v.stride += (moved / 1.5) * Math.PI * 2;
      v.swing = approach(v.swing, Math.min(1, s.speed / 5), 10, dt);
      v.crouch = approach(v.crouch, s.crouched ? 1 : 0, 10, dt);
      const raised = e.intent.aim || e.inCombat || e.alert === 'suspicious';
      v.ready = approach(v.ready, raised ? 1 : 0, 6, dt);
      v.sprint = approach(v.sprint, s.sprinting ? 1 : 0, 8, dt);
      v.reload = approach(v.reload, e.soldier.arsenal.current.status === 'reloading' ? 1 : 0, 8, dt);

      // Springs, in small steps.
      for (let t = 0; t < dt; t += SUB) {
        const h = Math.min(SUB, dt - t);
        v.kickVel += (-260 * v.kick - 22 * v.kickVel) * h;
        v.kick += v.kickVel * h * 0.06;
        for (const k of ['x', 'z']) {
          v.flinchVel[k] += (-120 * v.flinch[k] - 14 * v.flinchVel[k]) * h;
          v.flinch[k] += v.flinchVel[k] * h * 0.05;
        }
      }
      v.model.pose({
        stride: v.stride, swing: v.swing, crouch: v.crouch, pitch: e.motor.pitch,
        ready: v.ready, sprint: v.sprint, reload: v.reload, kick: -v.kick, flinch: v.flinch,
      });

      // Muzzle flash.
      v.flashTime -= dt;
      v.flash.visible = v.flashTime > 0;
      if (v.flash.visible) {
        v.model.muzzle.getWorldPosition(v.flash.position);
        v.flash.material.rotation = Math.random() * Math.PI;
      }

      // "?" and "!" over their heads. "!" shows for two seconds after spotting you.
      if (e.inCombat && !v.wasCombat) v.spottedAt = performance.now();
      v.wasCombat = e.inCombat;
      const spotted = performance.now() - v.spottedAt < 2000;
      const suspicious = !e.inCombat && (e.alert === 'suspicious' || e.senses.awareness >= 0.35);
      v.icon.visible = spotted || suspicious;
      if (v.icon.visible) {
        v.icon.material = spotted ? icons.spotted : icons.suspicious;
        v.icon.position.set(root.position.x, root.position.y + (s.crouched ? 1.55 : 2.15), root.position.z);
        const d = camera.position.distanceTo(v.icon.position);
        v.icon.scale.setScalar(Math.min(1.4, Math.max(0.45, d * 0.035)));
      }

      // The Marksman's laser: from the rifle, along its aim, until it hits something.
      if (v.laser) {
        const on = e.motor.laserOn && !e.dead;
        v.laser.visible = on;
        v.dot.visible = on;
        if (on) {
          root.updateMatrixWorld(true);
          v.model.laser.getWorldPosition(tmp);
          dir.set(0, 0, -1).applyQuaternion(v.model.parts.gun.getWorldQuaternion(new THREE.Quaternion()));
          ray.origin = { x: tmp.x, y: tmp.y, z: tmp.z };
          ray.dir = { x: dir.x, y: dir.y, z: dir.z };
          // It stops on whatever a bullet would hit: a wall, or you.
          const hit = world.castRay(ray, 150, true, undefined, BULLET, undefined, undefined, (c) => !e.soldier.owns(c));
          const len = hit ? hit.timeOfImpact : 150;
          v.laser.position.copy(tmp);
          v.laser.lookAt(tmp.clone().add(dir));
          v.laser.scale.set(1, 1, len);
          const charge = Math.min(1, e.motor.laser / (e.def.telegraph || 1));
          v.laser.material.opacity = 0.25 + 0.65 * charge;
          v.dot.position.copy(tmp).addScaledVector(dir, Math.max(0, len - 0.03));
          v.dot.scale.setScalar(0.08 + 0.1 * charge);
        }
      }
    }
  }

  return {
    group,
    views,
    update,
    /** Rebuild after a restart (every enemy is new). */
    reset() {
      ragdolls.clear();
      build();
    },
  };
}
