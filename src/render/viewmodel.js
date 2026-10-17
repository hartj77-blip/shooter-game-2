// The viewmodel: the gun and hands you see in front of you.
//
// It's drawn in its own little scene with its own camera (fixed field of view,
// tiny near plane) on top of the world, so it never pokes through walls and
// never stretches when you change your field of view.
//
// Almost all of its movement comes from springs. A spring pulls something back
// towards a resting place: kick it and it snaps back, overshoots a little and
// settles. Recoil kicks the gun backwards and up; looking around makes it lag
// behind (sway); walking bobs it; landing bounces it. Poses (hip, aiming,
// sprinting, switching, reloading) are blended on top.
//
// Presentation only: it reads the soldier's state and listens to events.

import * as THREE from 'three';
import { buildGun } from './gun-models.js';
import { events as gameEvents } from '../core/events.js';
import { damp } from '../player/camera.js';
import { GRENADE } from '../weapons/grenades.js';

const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));

/** A spring for several numbers at once: x is pulled to 0, kicks change its velocity. */
function spring(n, stiffness, damping) {
  const x = new Float32Array(n);
  const v = new Float32Array(n);
  return {
    x,
    kick(i, amount) { v[i] += amount; },
    update(dt) {
      const steps = Math.ceil(dt / (1 / 120)); // small steps keep stiff springs stable
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < n; i++) {
          v[i] += (-stiffness * x[i] - damping * v[i]) * h;
          x[i] += v[i] * h;
        }
      }
    },
  };
}

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, 64);
  glow.addColorStop(0, 'rgba(255,250,220,1)');
  glow.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  glow.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = glow;
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7);
    g.beginPath();
    g.moveTo(-7, 0);
    g.lineTo(0, -64 * (0.6 + 0.4 * ((i * 37) % 10) / 10));
    g.lineTo(7, 0);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 22, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createViewmodel({ soldier, input, settings, cameraRig, worldCamera, sunDir, mood = () => null, guns = null, events = gameEvents, owner = 0 }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, worldCamera.aspect, 0.01, 10);

  const hemi = new THREE.HemisphereLight('#a9bdd6', '#5a5544', 1.8);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  scene.add(hemi, sun, sun.target);
  let litFor = null; // the mood the lights were last set for

  const rig = new THREE.Group();
  scene.add(rig);

  // One model per gun you carry; only the one in your hands is visible.
  const models = {};
  for (const g of soldier.arsenal.guns) {
    const model = buildGun(g.def, { guns });
    model.group.visible = false;
    rig.add(model.group);
    models[g.def.id] = model;
  }

  // Muzzle flash: a glowing star, shown for a few hundredths of a second.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  flash.visible = false;
  flash.frustumCulled = false;
  let flashTime = 0;

  // Spent shells flying out of the side of the gun.
  const shellGeo = new THREE.BoxGeometry(0.009, 0.009, 0.026);
  const shellMat = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.7, roughness: 0.35 });
  const shells = Array.from({ length: 14 }, () => {
    const m = new THREE.Mesh(shellGeo, shellMat);
    m.visible = false;
    m.userData = { vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 };
    scene.add(m);
    return m;
  });
  let nextShell = 0;
  const tmp = new THREE.Vector3();

  // The grenade in your other hand while you throw (game logic: weapons/arsenal.js `throwing`).
  const grenadeInHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.065, 0.05),
    new THREE.MeshStandardMaterial({ color: '#3c4a2c', roughness: 0.8 }),
  );
  grenadeInHand.visible = false;
  scene.add(grenadeInHand);

  function ejectShell(model) {
    const s = shells[nextShell++ % shells.length];
    model.group.localToWorld(tmp.copy(model.eject));
    s.position.copy(tmp);
    s.userData.vel.set(1.1 + Math.random() * 0.5, 0.9 + Math.random() * 0.5, 0.25 + Math.random() * 0.3);
    s.userData.spin.set(Math.random() * 30, Math.random() * 30, Math.random() * 30);
    s.userData.life = 0.6;
    s.visible = true;
  }

  // Springs: [x, y, z] position and [pitch, yaw, roll] rotation of the gun.
  const kick = spring(6, 260, 24);
  const sway = spring(4, 90, 14);
  let sprintBlend = 0;
  let reloadBlend = 0;
  let pumpTime = 1;
  let slideTime = 1;
  let lastYaw = input.yaw;
  let lastPitch = input.pitch;
  let time = 0;
  let current = null;
  let scoped = 0; // 0..1: how far you're looking through a scope (the HUD draws its view)

  const mine = (e) => (e.owner ?? 0) === owner;

  events.on('weapon:fire', (e) => {
    if (!mine(e)) return;
    const def = soldier.arsenal.current.def;
    const model = models[def.id];
    const k = def.kick;
    const ads = soldier.arsenal.state.ads;
    const scale = 1 - ads * 0.45;
    kick.kick(2, k.back * 18 * scale);            // straight back
    kick.kick(1, k.up * 18 * scale);              // a little up
    kick.kick(3, (k.rot * Math.PI) / 180 * 16 * scale); // muzzle flips up
    kick.kick(4, (Math.random() - 0.5) * 0.6 * scale);
    kick.kick(5, (Math.random() - 0.5) * 0.8 * scale);
    flashTime = 0.045;
    flash.rotation.z = Math.random() * Math.PI;
    const size = (def.id === 'shotgun' ? 0.24 : def.id === 'pistol' ? 0.1 : 0.15) * (def.suppressed ? 0.35 : 1);
    flash.scale.setScalar(size * (0.85 + Math.random() * 0.3));
    slideTime = 0;
    if (!def.pump) ejectShell(model);
  });
  events.on('weapon:cue', (e) => {
    if (!mine(e) || !e.pump) return;
    pumpTime = 0;
    ejectShell(models[soldier.arsenal.current.def.id]);
  });
  events.on('player:land', (e) => {
    const { speed } = e;
    if (mine(e) && speed > 2) kick.kick(1, -Math.min(speed, 15) * 0.05);
  });

  /** Where the muzzle is in the world, for tracers and the muzzle light. */
  const ndc = new THREE.Vector3();
  const muzzlePos = new THREE.Vector3();
  function muzzleWorld(out = muzzlePos) {
    const model = models[soldier.arsenal.current.def.id];
    model.group.localToWorld(ndc.copy(model.muzzle));
    const dist = ndc.length();
    ndc.project(camera);
    out.set(ndc.x, ndc.y, 0.5).unproject(worldCamera).sub(worldCamera.position).normalize();
    return out.multiplyScalar(dist).add(worldCamera.position);
  }

  const pos = new THREE.Vector3();
  const rot = new THREE.Euler();
  const hip = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  function update(dt) {
    time += dt;
    const ars = soldier.arsenal;
    const gun = ars.current;
    const def = gun.def;
    const body = soldier.body.state;
    const model = models[def.id];
    const motion = settings.reduceMotion ? 0.3 : 1;

    if (current !== model) {
      if (current) current.group.visible = false;
      model.group.visible = true;
      model.group.add(flash);
      flash.position.copy(model.muzzle).add(tmp.set(0, 0, -0.03));
      current = model;
    }

    camera.aspect = worldCamera.aspect;
    camera.updateProjectionMatrix();

    // Light the gun from the same sun as the world: turn the sun's direction into camera space.
    inverse.copy(worldCamera.quaternion).invert();
    lightDir.copy(sunDir).applyQuaternion(inverse);
    sun.position.copy(lightDir).multiplyScalar(5);
    // ...and in the same light as the world (a gun lit like noon at night would glow).
    const m = mood();
    if (m && m !== litFor) {
      litFor = m;
      sun.color.set(m.sun);
      sun.intensity = m.sunIntensity * 0.85;
      hemi.color.set(m.hemiSky);
      hemi.groundColor.set(m.hemiGround);
      hemi.intensity = m.hemiIntensity * 0.8;
    }

    // Pose: hip and aim, blended.
    const ads = smooth(ars.state.ads);
    // A scope: in the last part of aiming, you're looking THROUGH it, so the
    // gun disappears and the HUD draws the scope's view instead (ui/hud.js).
    // Like putting your eye to a telescope: you stop seeing the telescope.
    scoped = model.reticle === 'scope' ? Math.min(1, Math.max(0, (ars.state.ads - 0.8) / 0.15)) : 0;
    rig.visible = scoped < 1;
    hip.copy(model.hip);
    aim.copy(model.sight).negate().add(tmp.set(0, 0, -def.ads.distance));
    pos.lerpVectors(hip, aim, ads);
    // At the hip the gun angles in a little towards the middle of the screen.
    rot.set(0, 0.05 * (1 - ads), -0.02 * (1 - ads));

    // Sprinting: the gun swings down and across your body.
    sprintBlend = damp(sprintBlend, body.sprinting ? 1 : 0, 9, dt);
    pos.x -= 0.07 * sprintBlend;
    pos.y -= 0.05 * sprintBlend;
    pos.z += 0.04 * sprintBlend;
    rot.x -= 0.32 * sprintBlend;
    rot.y += 0.6 * sprintBlend;
    rot.z += 0.3 * sprintBlend;

    // Switching: the gun drops out of view and the next one comes up.
    let lowered = 0;
    if (gun.status === 'raising') lowered = smooth(clamp01(gun.timer / def.swap.raise));
    else if (gun.status === 'lowering') lowered = smooth(1 - clamp01(gun.timer / def.swap.lower));
    else if (gun.status === 'stowed') lowered = 1;
    pos.y -= 0.32 * lowered;
    rot.x -= 0.8 * lowered;

    // Throwing a grenade: the gun dips out of the way while your other hand comes
    // up from below and lets go (at GRENADE.release into the gesture).
    const thr = ars.state.throwing;
    if (thr > 0) {
      const p = 1 - thr / GRENADE.gesture;
      const dip = Math.sin(Math.PI * Math.min(1, p * 1.15));
      pos.y -= 0.12 * dip;
      pos.x += 0.05 * dip;
      rot.x -= 0.35 * dip;
      rot.z -= 0.25 * dip;
      const k = Math.min(1, p / (GRENADE.release / GRENADE.gesture));
      grenadeInHand.visible = !ars.state.released && (ars.options.infiniteAmmo || ars.state.grenades > 0);
      grenadeInHand.position.set(-0.16 + 0.1 * k, -0.24 + 0.2 * smooth(k), -0.32 - 0.25 * k);
      grenadeInHand.rotation.set(k * 2, k, 0);
    } else grenadeInHand.visible = false;

    // Reloading: tilt the gun to show the magazine well, and swap the magazine.
    const r = gun.reload;
    reloadBlend = damp(reloadBlend, r ? 1 : 0, 10, dt);
    rot.z += 0.4 * reloadBlend;
    rot.x += 0.14 * reloadBlend;
    pos.y -= 0.035 * reloadBlend;
    pos.x -= 0.03 * reloadBlend;
    const mag = model.parts.mag;
    if (mag) {
      let drop = 0;
      if (r && !r.shells) {
        const p = r.elapsed / r.duration;
        if (p > 0.12 && p < 0.35) drop = smooth((p - 0.12) / 0.23);
        else if (p >= 0.35 && p < 0.5) drop = 1;
        else if (p >= 0.5 && p < 0.72) drop = 1 - smooth((p - 0.5) / 0.22);
      }
      mag.position.y = -0.3 * drop;
      mag.visible = drop < 0.95;
    }
    if (r?.shells && r.phase === 'shell') {
      const k = 1 - clamp01(r.timer / def.reload.perShell);
      pos.y -= Math.sin(k * Math.PI) * 0.012; // pressing a shell in
    }

    // Pump and slide.
    pumpTime += dt;
    if (model.parts.pump) model.parts.pump.position.z = pumpTime < 0.32 ? Math.sin((pumpTime / 0.32) * Math.PI) * 0.075 : 0;
    slideTime += dt;
    if (model.parts.slide) {
      const back = gun.mag === 0 ? 0.035 : slideTime < 0.07 ? Math.sin((slideTime / 0.07) * Math.PI) * 0.03 : 0;
      model.parts.slide.position.z = back;
    }

    // Bob (from the camera rig's footsteps) and a slow breath while standing still.
    const bobW = cameraRig.bobWeight * (1 - ads * 0.85) * motion;
    const ph = cameraRig.bobPhase;
    pos.x += Math.sin(ph * 0.5) * 0.011 * bobW;
    pos.y += -Math.abs(Math.sin(ph)) * 0.009 * bobW;
    pos.y += Math.sin(time * 1.7) * 0.0018 * (1 - ads * 0.8);

    // Sway: the gun lags behind when you turn.
    const dyaw = input.yaw - lastYaw;
    const dpitch = input.pitch - lastPitch;
    lastYaw = input.yaw;
    lastPitch = input.pitch;
    const swayK = (1 - ads * 0.8) * motion;
    if (dt > 0) {
      sway.kick(0, -dyaw * 6 * swayK);
      sway.kick(1, -dpitch * 6 * swayK);
      sway.kick(2, dyaw * 10 * swayK);
      sway.kick(3, dpitch * 8 * swayK);
    }
    sway.update(dt);
    kick.update(dt);
    const sx = sway.x;
    const kx = kick.x;
    const cap = (v, m) => Math.max(-m, Math.min(m, v));

    model.group.position.set(
      pos.x + cap(sx[0], 0.04) + kx[0],
      pos.y + cap(sx[1], 0.04) + kx[1],
      pos.z + kx[2],
    );
    model.group.rotation.set(
      rot.x + cap(sx[3], 0.12) + kx[3],
      rot.y + cap(sx[2], 0.15) + kx[4],
      rot.z + cap(sx[2], 0.15) * 0.5 + kx[5],
    );

    // Muzzle flash.
    flashTime -= dt;
    flash.visible = flashTime > 0;

    // Shells.
    for (const s of shells) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.vel.y -= 6 * dt;
      s.position.addScaledVector(u.vel, dt);
      s.rotation.x += u.spin.x * dt;
      s.rotation.y += u.spin.y * dt;
    }
  }

  return {
    scene, camera, update, muzzleWorld, models,
    /** 0..1, how far you're looking through a scope (the HUD's scope view). */
    get scoped() { return scoped; },
  };
}
