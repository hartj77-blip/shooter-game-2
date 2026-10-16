// Drawing soldiers: block soldiers that follow the simulation.
//
// Used for the enemies, (with friendly colours) for your teammates in co-op,
// and (orange, unarmed) for the hostage.
// For each soldier it reads a small "view" summary (where it is, which way it
// faces, how fast it moves, crouched or not, gun raised, reloading, alert,
// laser...) and poses its block soldier to match. On the co-op host those
// summaries come from the real simulation (viewOf() in ai/enemy.js); on a
// client they come from snapshots (net/proxies.js). Either way this file never
// changes the simulation. Extras:
//   - muzzle flashes and tracers (so you see where fire comes from)
//   - enemies: "?" over someone suspicious, "!" over someone who's just spotted
//     you, and the Marksman's laser, brightening as its shot gets closer
//   - teammates: lying down while they wait to be revived
//   - the ragdoll handover when someone goes down for good (render/ragdolls.js)
//
// Springs (gun kick, hit flinch) are stepped in small fixed steps (see lesson 6).

import * as THREE from 'three';
import { buildSoldier, SOLDIER_COLORS } from './soldier-model.js';
import { createCharacter } from './character.js';
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

// Past this many metres a soldier is drawn with the simpler body (render/character.js
// `detail`), seen at the default view (BASE_FOV: the camera's up-down field of view, in
// degrees; zoomed in, it's narrower and they count as nearer).
const DETAIL_FAR = 20;
const BASE_FOV = 68;

/**
 * Which drawn soldier an event is about. Enemy events name the soldier (`id`);
 * player events only say whose slot it was (`owner`), so look that up instead.
 * (Looking up `id` alone meant a teammate who bled out never fell as a ragdoll:
 * 'player:dead' has no `id`. Lesson 19.)
 */
export function viewForEvent(views, ev) {
  if (ev.id !== undefined && views.has(ev.id)) return views.get(ev.id);
  if (ev.owner === undefined) return null;
  for (const v of views.values()) if (v.owner === ev.owner) return v;
  return null;
}

/**
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene  where to add the models
 * @param {{list: Array}} opts.source  the soldiers to draw: each has an `id`, an `owner` and a `view` summary
 * @param {object} opts.effects   render/effects.js (tracers, muzzle light)
 * @param {object} [opts.ragdolls] render/ragdolls.js (maps with no enemies have none)
 * @param {object} opts.world     the physics world (read-only: where a laser lands)
 * @param {object} opts.registry  what each collider is (so a laser skips its own soldier)
 * @param {THREE.Camera} opts.camera
 * @param {object} opts.events
 * @param {object} [opts.colors]  SOLDIER_COLORS.enemy or .friend
 * @param {boolean} [opts.icons]  show "?" and "!" (enemies)
 * @param {string|null} [opts.downEvent] the event that turns one of these into a ragdoll
 *   (null: never; they just lie down, and vanish while `dead`. The hostage can come back at a checkpoint.)
 * @param {string} [opts.name]   the group's name in the scene
 * @param {object} [opts.assets]  render/assets.js: the animated soldier, if it loaded (else block soldiers)
 */
export function createSoldiersView({
  scene, source, effects, ragdolls = null, world, registry, camera, events,
  colors = SOLDIER_COLORS.enemy, icons: showIcons = true, downEvent = 'enemy:down', name = null, assets = null,
}) {
  const group = new THREE.Group();
  group.name = name ?? (showIcons ? 'enemies' : 'teammates');
  scene.add(group);
  const views = new Map(); // id -> drawing state

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

  function viewFor(s) {
    const first = s.view;
    const gltf = assets?.model('soldier');
    const model = gltf
      ? createCharacter({ gltf, guns: assets.model('guns'), weapon: first.weapon ?? null, colors })
      : buildSoldier({ weapon: first.weapon, colors });
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
      s, id: s.id, owner: s.owner, weapon: first.weapon, model, icon, flash, laser, dot,
      yaw: first.yaw,
      stride: 0, swing: 0, crouch: 0, ready: 0, sprint: 0, reload: 0, lying: 0,
      kick: 0, kickVel: 0,
      flinch: { x: 0, z: 0 }, flinchVel: { x: 0, z: 0 },
      flashTime: 0, spottedAt: -Infinity, wasCombat: false, heading: 0, throwT: -1,
      last: new THREE.Vector3(first.pos.x, first.pos.y, first.pos.z),
      dead: false,
    };
    views.set(s.id, v);
    return v;
  }

  function remove(v) {
    v.model.dispose?.();
    group.remove(v.model.root, v.icon, v.flash);
    if (v.laser) group.remove(v.laser, v.dot);
    views.delete(v.id);
  }

  /** Make sure every soldier in the source has a model, and drop the ones that left. */
  function sync() {
    const ids = new Set();
    for (const s of source.list) {
      ids.add(s.id);
      const v = views.get(s.id);
      if (v && v.s !== s) { remove(v); viewFor(s); } // a new soldier with an old name (after a restart)
      else if (!v) viewFor(s);
      else if (v.weapon !== s.view.weapon) { remove(v); viewFor(s); } // switched guns (teammates)
    }
    for (const v of [...views.values()]) if (!ids.has(v.id)) remove(v);
  }

  const byOwner = (owner) => {
    for (const v of views.values()) if (v.owner === owner) return v;
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
  // Someone else throwing a grenade: their arm swings (render/character.js).
  events.on('grenade:throw', (ev) => {
    const v = byOwner(ev.owner);
    if (v && !v.dead) v.throwT = 0;
  });
  events.on('target:hit', (ev) => {
    const v = views.get(ev.target?.id ?? ev.id);
    if (!v) return;
    const k = Math.min(1, ev.damage / 30);
    v.flinchVel.x += (Math.random() < 0.5 ? -1 : 1) * 3 * k - 4 * k;
    v.flinchVel.z += (Math.random() * 2 - 1) * 5 * k;
  });
  if (downEvent) events.on(downEvent, (ev) => {
    const v = viewForEvent(views, ev);
    if (!v || v.dead) return;
    v.dead = true;
    v.icon.visible = false;
    if (v.laser) { v.laser.visible = false; v.dot.visible = false; }
    if (ragdolls) ragdolls.spawn(v.model, ev);
    else v.model.root.visible = false;
  });

  function update(dt, alpha) {
    sync();
    for (const v of views.values()) {
      if (v.dead) continue;
      const e = v.s.view;
      const root = v.model.root;
      root.visible = !e.dead;
      const prev = e.prev ?? e.pos;
      root.position.set(prev.x + (e.pos.x - prev.x) * alpha, prev.y + (e.pos.y - prev.y) * alpha, prev.z + (e.pos.z - prev.z) * alpha);
      v.yaw += wrap(e.yaw - v.yaw) * (1 - Math.exp(-18 * dt));
      root.rotation.y = v.yaw;
      // A downed teammate lies on their back, waiting for help.
      v.lying = approach(v.lying, e.down ? 1 : 0, 6, dt);
      const skinned = v.model.kind === 'skinned';
      if (!skinned) {
        root.rotation.x = -1.35 * v.lying;
        root.position.y += 0.25 * v.lying;
      }

      // How far it walked this frame drives the stride (and, for an animated
      // soldier, which way it's going compared with where it faces).
      const mx = root.position.x - v.last.x, mz = root.position.z - v.last.z;
      const moved = Math.hypot(mx, mz);
      if (moved > 0.002) {
        const toward = wrap(Math.atan2(-mx, -mz) - v.yaw);
        v.heading += wrap(toward - v.heading) * (1 - Math.exp(-10 * dt));
      }
      v.last.copy(root.position);
      v.stride += (moved / 1.5) * Math.PI * 2;
      v.swing = approach(v.swing, Math.min(1, e.speed / 5) * (1 - v.lying), 10, dt);
      v.crouch = approach(v.crouch, e.crouched ? 1 : 0, 10, dt);
      v.ready = approach(v.ready, e.ready ? 1 : 0, 6, dt);
      v.sprint = approach(v.sprint, e.sprinting ? 1 : 0, 8, dt);
      v.reload = approach(v.reload, e.reloading ? 1 : 0, 8, dt);

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
      if (v.throwT >= 0) { v.throwT += dt / 0.6; if (v.throwT > 1) v.throwT = -1; }
      // Far away, an animated soldier is posed less often (you can't see the difference
      // at that distance, and posing a skeleton costs time): every 2nd frame past 35 m,
      // every 4th past 70 m. Their time adds up, so the animation keeps its pace.
      v.poseDt = (v.poseDt ?? 0) + dt;
      let posing = true;
      if (skinned) {
        const far = camera.position.distanceTo(root.position);
        const every = far > 70 ? 4 : far > 35 ? 2 : 1;
        v.frame = ((v.frame ?? 0) + 1) % every;
        posing = v.frame === 0;
        // ...and drawn with the simpler body past DETAIL_FAR, judged by how big they
        // look (zooming in with a scope makes them look nearer).
        v.model.detail(far * (camera.fov / BASE_FOV) > DETAIL_FAR ? 1 : 0);
      }
      if (posing) {
        v.model.pose({
          stride: v.stride, swing: v.swing, crouch: v.crouch, pitch: e.pitch,
          ready: v.ready, sprint: v.sprint, reload: v.reload, kick: -v.kick, flinch: v.flinch,
          dt: v.poseDt, speed: e.speed ?? 0, heading: v.heading, lying: v.lying, throwing: Math.max(0, v.throwT), captive: !!e.captive,
        });
        v.poseDt = 0;
      }

      // Muzzle flash.
      v.flashTime -= dt;
      v.flash.visible = v.flashTime > 0;
      if (v.flash.visible) {
        v.model.muzzle.getWorldPosition(v.flash.position);
        v.flash.material.rotation = Math.random() * Math.PI;
      }

      // "?" and "!" over their heads. "!" shows for two seconds after spotting someone.
      if (showIcons) {
        if (e.inCombat && !v.wasCombat) v.spottedAt = performance.now();
        v.wasCombat = e.inCombat;
        const spotted = performance.now() - v.spottedAt < 2000;
        const suspicious = !e.inCombat && (e.alert === 'suspicious' || e.awareness >= 0.35);
        v.icon.visible = spotted || suspicious;
        if (v.icon.visible) {
          v.icon.material = spotted ? icons.spotted : icons.suspicious;
          v.icon.position.set(root.position.x, root.position.y + (e.crouched ? 1.55 : 2.15), root.position.z);
          const d = camera.position.distanceTo(v.icon.position);
          v.icon.scale.setScalar(Math.min(1.4, Math.max(0.45, d * 0.035)));
        }
      }

      // The Marksman's laser: from the rifle, along its aim, until it hits something.
      if (v.laser) {
        const on = e.laserOn && !e.dead;
        v.laser.visible = on;
        v.dot.visible = on;
        if (on) {
          root.updateMatrixWorld(true);
          v.model.laser.getWorldPosition(tmp);
          dir.set(0, 0, -1).applyQuaternion(v.model.parts.gun.getWorldQuaternion(new THREE.Quaternion()));
          ray.origin = { x: tmp.x, y: tmp.y, z: tmp.z };
          ray.dir = { x: dir.x, y: dir.y, z: dir.z };
          // It stops on whatever a bullet would hit: a wall, or a player (not the Marksman itself).
          const hit = world.castRay(ray, 150, true, undefined, BULLET, undefined, undefined, (c) => registry.get(c).target?.id !== v.id);
          const len = hit ? hit.timeOfImpact : 150;
          v.laser.position.copy(tmp);
          v.laser.lookAt(tmp.clone().add(dir));
          v.laser.scale.set(1, 1, len);
          v.laser.material.opacity = 0.25 + 0.65 * e.laserCharge;
          v.dot.position.copy(tmp).addScaledVector(dir, Math.max(0, len - 0.03));
          v.dot.scale.setScalar(0.08 + 0.1 * e.laserCharge);
        }
      }
    }
  }

  return {
    group,
    views,
    update,
    /** Rebuild after a restart (every soldier is new). */
    reset() {
      ragdolls?.clear();
      for (const v of [...views.values()]) remove(v);
      sync();
    },
  };
}
