// World effects: tracers, bullet holes, dust, sparks and splinters, and the
// muzzle light that flashes on nearby walls.
//
// Everything here uses object pools: a fixed number of each effect is made
// once, at the start, and reused, oldest first. Making and throwing away
// thousands of objects a minute makes the browser stop to clean up ("garbage
// collection"), which shows up as stutters. Reusing is like a restaurant
// washing plates instead of buying new ones for every meal.

import * as THREE from 'three';
import { SURFACES } from '../world/surfaces.js';

function pool(count, make) {
  const items = Array.from({ length: count }, make);
  let next = 0;
  return {
    items,
    /** The next item to (re)use: the oldest one. */
    take() {
      const it = items[next];
      next = (next + 1) % items.length;
      return it;
    },
  };
}

function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(10,10,10,1)');
  grad.addColorStop(0.3, 'rgba(25,22,20,0.95)');
  grad.addColorStop(0.55, 'rgba(40,36,32,0.5)');
  grad.addColorStop(1, 'rgba(40,36,32,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createEffects(scene, { showPaths = false } = {}) {
  const group = new THREE.Group();
  group.name = 'effects';
  scene.add(group);

  // ---- tracers: a glowing streak that races along the bullet's path
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
  const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffd68a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tracers = pool(32, () => {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    m.frustumCulled = false;
    m.userData = { from: new THREE.Vector3(), dir: new THREE.Vector3(), length: 0, t: 0 };
    group.add(m);
    return m;
  });
  const TRACER_SPEED = 450;
  const TRACER_STREAK = 5;

  // ---- bullet holes
  const holeGeo = new THREE.PlaneGeometry(1, 1);
  const holeMat = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const holes = pool(160, () => {
    const m = new THREE.Mesh(holeGeo, holeMat);
    m.visible = false;
    group.add(m);
    return m;
  });

  // ---- dust puffs
  const puffTex = puffTexture();
  const puffs = pool(48, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    s.visible = false;
    s.userData = { life: 0, max: 1, grow: 1, vel: new THREE.Vector3() };
    group.add(s);
    return s;
  });

  // ---- sparks (glowing) and debris (chips of wood, paper, concrete)
  const bitGeo = new THREE.BoxGeometry(1, 1, 1);
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffcf6e', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  const bits = pool(140, () => {
    const m = new THREE.Mesh(bitGeo, sparkMat);
    m.visible = false;
    m.userData = { vel: new THREE.Vector3(), life: 0 };
    group.add(m);
    return m;
  });
  const debrisMats = new Map();
  const debrisMat = (color) => {
    if (!debrisMats.has(color)) debrisMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    return debrisMats.get(color);
  };

  // ---- the muzzle light (one, reused)
  const light = new THREE.PointLight('#ffb35c', 0, 9, 2);
  scene.add(light);
  let lightTime = 0;

  // ---- debug: bullet paths
  const pathMat = new THREE.LineBasicMaterial({ color: '#ff5a3c' });
  const paths = pool(40, () => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), pathMat);
    l.visible = false;
    l.frustumCulled = false;
    l.userData = { life: 0 };
    group.add(l);
    return l;
  });

  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const options = { showPaths };

  function tracer(from, to) {
    const t = tracers.take();
    t.userData.from.copy(from);
    t.userData.dir.subVectors(to, from);
    t.userData.length = t.userData.dir.length();
    t.userData.dir.normalize();
    t.userData.t = 0;
    t.visible = true;
    t.position.copy(from);
    t.lookAt(tmp.copy(from).add(t.userData.dir));
  }

  function path(from, to) {
    const l = paths.take();
    l.geometry.attributes.position.setXYZ(0, from.x, from.y, from.z);
    l.geometry.attributes.position.setXYZ(1, to.x, to.y, to.z);
    l.geometry.attributes.position.needsUpdate = true;
    l.userData.life = 2.5;
    l.visible = true;
  }

  function muzzleLight(at) {
    light.position.copy(at);
    light.intensity = 18;
    lightTime = 0.05;
  }

  /**
   * A bullet hit something.
   * @param {{point, normal, surface, target}} hit
   */
  function impact(hit) {
    const surface = SURFACES[hit.surface] ?? SURFACES.concrete;
    const p = tmp.set(hit.point.x, hit.point.y, hit.point.z);
    const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);

    // A bullet hole, flat on the surface (targets move, so they get none).
    if (!hit.target && hit.surface !== 'steel') {
      const h = holes.take();
      h.position.copy(p).addScaledVector(n, 0.004);
      h.lookAt(tmp.copy(h.position).add(n));
      h.rotateZ(Math.random() * Math.PI * 2);
      h.scale.setScalar(hit.surface === 'dirt' ? 0.1 : 0.065);
      h.visible = true;
    }

    // A puff of dust in the surface's colour.
    const puff = puffs.take();
    puff.position.set(hit.point.x, hit.point.y, hit.point.z).addScaledVector(n, 0.05);
    puff.material.color.set(surface.dust);
    puff.material.opacity = 0.7;
    puff.userData.life = puff.userData.max = 0.55;
    puff.userData.grow = hit.surface === 'dirt' ? 1.4 : 0.8;
    puff.userData.vel.copy(n).multiplyScalar(0.6).add(up.clone().multiplyScalar(0.3));
    puff.scale.setScalar(0.08);
    puff.visible = true;

    // Sparks off metal, chips off everything else.
    const sparky = surface.sparks;
    const count = sparky ? 7 : 4;
    for (let i = 0; i < count; i++) {
      const b = bits.take();
      b.position.set(hit.point.x, hit.point.y, hit.point.z);
      b.material = sparky ? sparkMat : debrisMat(surface.dust);
      const speed = sparky ? 4 + Math.random() * 4 : 1.5 + Math.random() * 2;
      b.userData.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(1.2).add(n).normalize().multiplyScalar(speed);
      b.userData.life = sparky ? 0.18 + Math.random() * 0.15 : 0.35 + Math.random() * 0.3;
      b.scale.set(sparky ? 0.012 : 0.02, sparky ? 0.012 : 0.02, sparky ? 0.06 : 0.02);
      b.lookAt(tmp.copy(b.position).add(b.userData.vel));
      b.visible = true;
    }
  }

  function update(dt) {
    for (const t of tracers.items) {
      if (!t.visible) continue;
      const u = t.userData;
      u.t += dt * TRACER_SPEED;
      const head = Math.min(u.t, u.length);
      const tail = Math.max(0, u.t - TRACER_STREAK);
      if (tail >= u.length) { t.visible = false; continue; }
      t.position.copy(u.from).addScaledVector(u.dir, head);
      t.scale.set(0.014, 0.014, Math.max(0.01, head - tail));
    }
    for (const p of puffs.items) {
      if (!p.visible) continue;
      const u = p.userData;
      u.life -= dt;
      if (u.life <= 0) { p.visible = false; continue; }
      const k = 1 - u.life / u.max;
      p.scale.setScalar(0.08 + k * 0.45 * u.grow);
      p.material.opacity = 0.7 * (1 - k);
      p.position.addScaledVector(u.vel, dt);
    }
    for (const b of bits.items) {
      if (!b.visible) continue;
      const u = b.userData;
      u.life -= dt;
      if (u.life <= 0) { b.visible = false; continue; }
      u.vel.y -= 9.8 * dt;
      b.position.addScaledVector(u.vel, dt);
    }
    for (const l of paths.items) {
      if (!l.visible) continue;
      l.userData.life -= dt;
      if (l.userData.life <= 0) l.visible = false;
    }
    lightTime -= dt;
    light.intensity = lightTime > 0 ? 18 : 0;
  }

  return { tracer, impact, muzzleLight, path, update, options };
}
