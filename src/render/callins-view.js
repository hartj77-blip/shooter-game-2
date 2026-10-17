// Drawing the call-ins (game/callins.js): a crate under a parachute, a drone
// circling high up, the red smoke that warns of a mortar strike, and the grey
// clouds of a smoke screen.
//
// Presentation only: it reads `session.callins.view` (the host's own, or the
// one a client gets in snapshots), so every screen draws the same thing. The
// view's clock ("seconds left") arrives 20 times a second on a client; each
// call-in keeps its own smooth countdown and only jumps when it's clearly off.
//
// Talks to: the session (net/host.js or net/client.js), three.js.

import * as THREE from 'three';
import { CALLINS } from '../game/callins.js';

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene  the mission's root group
 * @param {object} opts.session        its `callins.view` is drawn
 * @param {object} [opts.tuning]       CALLINS (heights, sizes, times)
 */
export function createCallinsView({ scene, session, tuning = CALLINS }) {
  const group = new THREE.Group();
  group.name = 'callins';
  scene.add(group);

  // ---- shared shapes and paints (made once, freed in dispose())
  const tex = softTexture();
  const lib = {
    crate: new THREE.BoxGeometry(0.9, 0.6, 0.6).translate(0, 0.3, 0),
    stripe: new THREE.BoxGeometry(0.92, 0.12, 0.62).translate(0, 0.42, 0),
    chute: new THREE.SphereGeometry(2.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4).translate(0, 4.2, 0),
    lines: new THREE.BufferGeometry().setFromPoints([
      [-0.45, 0.6, -0.3], [-1.6, 4.6, -1.6], [0.45, 0.6, -0.3], [1.6, 4.6, -1.6],
      [-0.45, 0.6, 0.3], [-1.6, 4.6, 1.6], [0.45, 0.6, 0.3], [1.6, 4.6, 1.6],
    ].map((p) => new THREE.Vector3(...p))),
    droneBody: new THREE.BoxGeometry(0.5, 0.15, 0.5),
    droneArm: new THREE.BoxGeometry(1.1, 0.05, 0.08),
    rotor: new THREE.CylinderGeometry(0.22, 0.22, 0.02, 12),
  };
  const mats = {
    crate: new THREE.MeshStandardMaterial({ color: '#58603e', roughness: 0.85 }),
    stripe: new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.6 }),
    chute: new THREE.MeshStandardMaterial({ color: '#d7d1bd', roughness: 0.9, side: THREE.DoubleSide }),
    lines: new THREE.LineBasicMaterial({ color: '#2b2b2b' }),
    drone: new THREE.MeshStandardMaterial({ color: '#2a2d2f', roughness: 0.5, metalness: 0.3 }),
    rotor: new THREE.MeshBasicMaterial({ color: '#111111', transparent: true, opacity: 0.35 }),
    redSmoke: new THREE.SpriteMaterial({ map: tex, color: '#d8402c', transparent: true, depthWrite: false, opacity: 0.8 }),
    greySmoke: new THREE.SpriteMaterial({ map: tex, color: '#c9c7c0', transparent: true, depthWrite: false, opacity: 0.9 }),
    light: new THREE.SpriteMaterial({ map: tex, color: '#ff3a2a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  };

  const items = new Map(); // call-in id -> { obj, update(v, dt) }

  function puffs(material, n, opacity) {
    return Array.from({ length: n }, () => {
      const s = new THREE.Sprite(material.clone()); // (each fades on its own)
      s.material.opacity = 0;
      s.userData = { seed: Math.random(), base: opacity };
      return s;
    });
  }

  function build(v) {
    const obj = new THREE.Group();
    obj.position.set(v.pos.x, v.pos.y, v.pos.z);
    group.add(obj);
    let t = v.t; // our own smooth countdown
    let age = 0;
    const clock = (fresh, dt) => {
      t = Math.abs(fresh.t - t) > 0.25 || !Number.isFinite(fresh.t) ? fresh.t : t - dt;
      age += dt;
    };

    if (v.kind === 'supply') {
      const box = new THREE.Group();
      box.add(new THREE.Mesh(lib.crate, mats.crate), new THREE.Mesh(lib.stripe, mats.stripe));
      box.children.forEach((m) => { m.castShadow = true; });
      const chute = new THREE.Group();
      chute.add(new THREE.Mesh(lib.chute, mats.chute), new THREE.LineSegments(lib.lines, mats.lines));
      box.add(chute);
      const flare = new THREE.Sprite(mats.light); // a red light on the crate, easy to find
      flare.position.y = 0.75;
      flare.scale.setScalar(0.5);
      box.add(flare);
      obj.add(box);
      return {
        obj,
        update(fresh, dt) {
          clock(fresh, dt);
          obj.visible = fresh.phase !== 'inbound';
          const falling = fresh.phase === 'active';
          const k = falling ? Math.max(0, t / tuning.supply.fall) : 0;
          box.position.y = k * tuning.supply.height;
          box.rotation.y = falling ? Math.sin(age * 0.8) * 0.3 : 0;
          chute.visible = falling;
          flare.visible = fresh.left > 0 && Math.floor(age * 2) % 2 === 0;
        },
      };
    }

    if (v.kind === 'recon') {
      const drone = new THREE.Group();
      const arms = [new THREE.Mesh(lib.droneArm, mats.drone), new THREE.Mesh(lib.droneArm, mats.drone)];
      arms[0].rotation.y = Math.PI / 4;
      arms[1].rotation.y = -Math.PI / 4;
      drone.add(new THREE.Mesh(lib.droneBody, mats.drone), ...arms);
      for (const [x, z] of [[0.39, 0.39], [-0.39, 0.39], [0.39, -0.39], [-0.39, -0.39]]) {
        const r = new THREE.Mesh(lib.rotor, mats.rotor);
        r.position.set(x, 0.06, z);
        drone.add(r);
      }
      const blink = new THREE.Sprite(mats.light);
      blink.scale.setScalar(0.6);
      blink.position.y = -0.12;
      drone.add(blink);
      drone.scale.setScalar(1.6); // high up: a little bigger, to be seen at all
      obj.add(drone);
      return {
        obj,
        update(fresh, dt) {
          clock(fresh, dt);
          obj.visible = fresh.phase === 'active';
          // Circling the spot, a slow lazy loop.
          const a = age * 0.35;
          drone.position.set(Math.cos(a) * 12, tuning.recon.height + Math.sin(age * 0.9) * 0.6, Math.sin(a) * 12);
          drone.rotation.y = -a;
          blink.visible = Math.floor(age * 1.5) % 2 === 0;
        },
      };
    }

    if (v.kind === 'mortar') {
      // Red smoke rising from the mark: the warning, for both sides.
      const sprites = puffs(mats.redSmoke, 14, 0.8);
      obj.add(...sprites);
      return {
        obj,
        update(fresh, dt) {
          clock(fresh, dt);
          obj.visible = fresh.phase === 'active';
          const fade = Math.min(1, age / 0.8, Math.max(0, t) / 1.5);
          for (const s of sprites) {
            const u = (s.userData.seed + age * 0.18) % 1; // each puff rises, then starts again
            s.position.set(Math.sin(s.userData.seed * 40) * (0.3 + u * 1.5), 0.3 + u * 7, Math.cos(s.userData.seed * 40) * (0.3 + u * 1.5));
            s.scale.setScalar(0.8 + u * 3.5);
            s.material.opacity = s.userData.base * (1 - u) * fade;
          }
        },
      };
    }

    if (v.kind === 'smoke') {
      const R = tuning.smoke.radius;
      let sprites = [];
      return {
        obj,
        update(fresh, dt) {
          clock(fresh, dt);
          obj.visible = fresh.phase === 'active';
          // The clouds are only known once it arrives (they're placed then: game/callins.js).
          if (!sprites.length && fresh.clouds) {
            sprites = fresh.clouds.flatMap((c) => puffs(mats.greySmoke, 9, 0.9).map((sp) => {
              sp.userData.at = { x: c.x - v.pos.x, y: c.y - v.pos.y, z: c.z - v.pos.z };
              return sp;
            }));
            obj.add(...sprites);
            age = 0;
          }
          const fade = Math.min(1, age / 1.5, Math.max(0, t) / 3); // billows out, thins away at the end
          for (const s of sprites) {
            const k = s.userData.seed;
            const drift = age * 0.15 + k * 10;
            s.position.set(
              s.userData.at.x + Math.sin(drift + k * 7) * R * 0.55,
              s.userData.at.y + Math.sin(drift * 0.7 + k * 3) * R * 0.35,
              s.userData.at.z + Math.cos(drift + k * 5) * R * 0.55,
            );
            s.scale.setScalar(R * (1.5 + 0.6 * k) * (0.5 + 0.5 * fade));
            s.material.opacity = s.userData.base * fade;
          }
        },
      };
    }
    return { obj, update() {} };
  }

  function update(dt) {
    const view = session.callins?.view ?? [];
    const seen = new Set();
    for (const v of view) {
      seen.add(v.id);
      if (!items.has(v.id)) items.set(v.id, build(v));
      items.get(v.id).update(v, dt);
    }
    for (const [id, it] of items) {
      if (seen.has(id)) continue;
      group.remove(it.obj);
      it.obj.traverse((o) => { if (o.isSprite && o.material !== mats.light) o.material.dispose(); });
      items.delete(id);
    }
  }

  return {
    update,
    get count() { return items.size; },
    dispose() {
      for (const it of items.values()) it.obj.traverse((o) => { if (o.isSprite && o.material !== mats.light) o.material.dispose(); });
      items.clear();
      scene.remove(group);
      for (const g of Object.values(lib)) g.dispose();
      for (const m of Object.values(mats)) m.dispose();
      tex.dispose();
    },
  };
}
