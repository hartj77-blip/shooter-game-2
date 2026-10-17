// Mission props: the things a mission puts in the world, drawn from its `view`.
//
//   - intel: a laptop on the real room's table (its screen goes green while
//     downloading, red when the download stalls), then the drive, on the table
//     or wherever its carrier dropped it
//   - sabotage: weapons caches (a tarp and green boxes over a stack of crates),
//     a charge with a blinking light once one is planted, and the stack burnt
//     once it's blown
//   - hold the line: the radio, and a ring on the ground showing the area to hold
//   - extraction: the radio at the landing zone, and a green flare once the
//     helicopter is called
//   - ammo crates: a yellow stripe, grey once they're empty
//   - grenades in flight
//
// The tables, crate stacks and radio stands themselves are level geometry (a
// site's `prop`, world/kit.js): solid, and there in every mission. This only
// adds what's on them, so a table with no laptop is a room you don't need. Everything is read from the mission's `view` (the same on the
// host and on co-op clients) and the level; nothing here touches the
// simulation. Each stage's props stay once it's done (a destroyed cache stays
// burnt), until a retry winds the mission back.

import * as THREE from 'three';
import { paintedBox, mergeGeometries } from './merge.js';
import { soldierMaterial } from './soldier-model.js';

const posOf = (s) => ({ x: s.at[0], y: s.at[1] ?? 0, z: s.at[2] });

// Built once each, then shared by every copy (vertex-coloured, one material).
function shapes() {
  return {
    laptop: mergeGeometries([
      paintedBox([0.36, 0.025, 0.26], [0, 0.78, 0.02], '#2b2d30'),
      paintedBox([0.36, 0.24, 0.02], [0, 0.9, 0.15], '#2b2d30'),
    ]),
    screen: new THREE.PlaneGeometry(0.32, 0.2).rotateY(Math.PI).translate(0, 0.9, 0.138),
    drive: paintedBox([0.09, 0.025, 0.14], [0, 0.0125, 0], '#c9a227'),
    // Over the site's crate stack (1.3 x 0.9 x 0.7 m): a tarp hanging down its
    // sides, and green weapon cases on top.
    cache: mergeGeometries([
      paintedBox([1.38, 0.04, 0.78], [0, 0.92, 0], '#2f3a2f'),
      ...[-1, 1].map((s) => paintedBox([1.38, 0.45, 0.02], [0, 0.69, s * 0.38], '#2f3a2f')),
      ...[-1, 1].map((s) => paintedBox([0.02, 0.45, 0.78], [s * 0.68, 0.69, 0], '#2f3a2f')),
      paintedBox([0.6, 0.3, 0.4], [-0.3, 1.09, 0], '#4a5634'),
      paintedBox([0.45, 0.22, 0.35], [0.35, 1.05, 0.04], '#3f4a2e'),
    ]),
    // The same stack, charred, with wreckage on top.
    burnt: mergeGeometries([
      paintedBox([1.34, 0.92, 0.74], [0, 0.46, 0], '#1d1b19'),
      paintedBox([0.6, 0.25, 0.45], [0.2, 1.0, 0.05], '#2a2622', [0.2, 0.4, 0]),
    ]),
    charge: mergeGeometries([
      paintedBox([0.24, 0.14, 0.1], [0, 0, 0], '#6d6a5e'),
      paintedBox([0.1, 0.03, 0.11], [0.04, 0.08, 0], '#2a2a2a'),
    ]),
    blink: new THREE.SphereGeometry(0.025, 8, 6),
    radio: mergeGeometries([
      paintedBox([0.4, 0.28, 0.2], [0, 0.64, 0], '#2f342c'),
      paintedBox([0.3, 0.06, 0.02], [0, 0.66, -0.105], '#141614'),
      paintedBox([0.015, 0.7, 0.015], [0.15, 1.12, 0.05], '#1a1a1a'), // aerial
    ]),
    stripe: paintedBox([1.12, 0.12, 0.72], [0, 0.5, 0], '#c9a227'),
    grenade: mergeGeometries([
      paintedBox([0.075, 0.1, 0.075], [0, 0, 0], '#3c4a2c'),
      paintedBox([0.03, 0.04, 0.03], [0, 0.065, 0], '#8a8a80'),
    ]),
    ring: new THREE.RingGeometry(0.97, 1, 72).rotateX(-Math.PI / 2),
  };
}

/**
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene
 * @param {object} opts.session  net/host.js or net/client.js (operation, grenades, supply, level)
 */
export function createPropsView({ scene, session }) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);
  const g = shapes();
  const mat = soldierMaterial(); // the shared vertex-colour material
  const level = session.level.expanded;
  const sites = level.sites;
  const op = session.operation;
  const mission = op?.mission ?? null;

  const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity >= 1 });
  const mats = {
    screenIdle: glow('#3a6ea8'), screenGo: glow('#3fd27a'), screenStall: glow('#ff4a3a'), screenDone: glow('#a0e8ff'),
    blink: glow('#ff2a1a'), flare: glow('#7dff7a'),
    ring: glow('#5ec8ff', 0.5), ringWarn: glow('#ff5a3c', 0.6),
    stripeEmpty: new THREE.MeshStandardMaterial({ color: '#55554f', roughness: 0.9 }),
  };
  const mesh = (geo, m = mat, at = null, yaw = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = m === mat;
    o.receiveShadow = m === mat;
    if (at) o.position.set(at.x, at.y, at.z);
    o.rotation.y = yaw;
    group.add(o);
    return o;
  };

  // ---- ammo crates: always there (the level draws the box; this adds the stripe)
  const crates = (session.supply?.list ?? []).map((c, i) => {
    const def = level.crates[i];
    return { c, stripe: mesh(g.stripe, mat, c.pos, def?.rotY ?? 0) };
  });

  // ---- each stage's props, made the first time that stage is seen
  const stages = new Map(); // stage index -> { kind, parts, update(v, active) }
  const chosen = new Map(); // stage index -> the real sites (from the view while it's active)

  function build(index, kind, real) {
    const parts = [];
    const add = (o) => { parts.push(o); return o; };
    const at = (i) => posOf(sites[i]);
    const yaw = (i) => sites[i].yaw ?? 0;
    if (kind === 'intel') {
      const i = real[0];
      const laptop = add(mesh(g.laptop, mat, at(i), yaw(i)));
      const screen = add(mesh(g.screen, mats.screenIdle, at(i), yaw(i)));
      const drive = add(mesh(g.drive, mat, { ...at(i), y: at(i).y + 0.77 }, yaw(i)));
      drive.position.x += 0.35 * Math.cos(yaw(i));
      drive.position.z -= 0.35 * Math.sin(yaw(i));
      return {
        parts,
        update(v, active) {
          const phase = active ? v.phase : 'done';
          screen.material = !active ? mats.screenDone : phase === 'download' ? (v.contested ? mats.screenStall : mats.screenGo) : phase === 'find' ? mats.screenIdle : mats.screenDone;
          // Blink while downloading, as if busy.
          screen.visible = !(phase === 'download' && !v.contested && Math.floor(performance.now() / 400) % 4 === 0);
          drive.visible = active && phase === 'collect';
          laptop.visible = true;
        },
      };
    }
    if (kind === 'sabotage') {
      const caches = real.map((i) => ({
        cache: add(mesh(g.cache, mat, at(i), yaw(i))),
        burnt: add(mesh(g.burnt, mat, at(i), yaw(i))),
        charge: add(mesh(g.charge, mat, { ...at(i), y: at(i).y + 0.6 }, yaw(i))),
        light: add(mesh(g.blink, mats.blink, { ...at(i), y: at(i).y + 0.69 }, 0)),
      }));
      for (const c of caches) {
        // The charge is stuck to the front of the cache (its -Z side, the way the site faces).
        const y = c.charge.rotation.y;
        for (const o of [c.charge, c.light]) { o.position.x -= 0.45 * Math.sin(y); o.position.z -= 0.45 * Math.cos(y); }
      }
      return {
        parts,
        update(v, active) {
          caches.forEach((c, k) => {
            const done = !active || !!(v.done & (1 << k));
            const armed = active && !done && !!(v.armed & (1 << k));
            c.cache.visible = !done;
            c.burnt.visible = done;
            c.charge.visible = armed;
            // Blinks faster as the fuse runs down.
            const rate = armed && v.timer < 3 ? 120 : 400;
            c.light.visible = armed && Math.floor(performance.now() / rate) % 2 === 0;
          });
        },
      };
    }
    if (kind === 'hold') {
      const i = real[0];
      const s = sites[i];
      add(mesh(g.radio, mat, at(i), yaw(i)));
      const ring = add(mesh(g.ring, mats.ring, { ...at(i), y: at(i).y + 0.05 }));
      ring.scale.setScalar(s.radius ?? 8);
      return {
        parts,
        update(v, active) {
          ring.visible = active && v.phase === 'hold';
          ring.material = v.contested ? mats.ringWarn : mats.ring;
        },
      };
    }
    if (kind === 'extract') {
      const lz = level.lzs.find((l) => l.id === mission.stages[index].lz) ?? level.lzs[0];
      const radioAt = { x: lz.radio[0], y: lz.at[1] ?? 0, z: lz.radio[1] };
      add(mesh(g.radio, mat, radioAt, 0));
      const flare = add(mesh(g.blink, mats.flare, posOf(lz)));
      flare.scale.setScalar(3);
      const light = add(new THREE.PointLight('#7dff7a', 0, 14, 2));
      light.position.set(lz.at[0], (lz.at[1] ?? 0) + 0.6, lz.at[2]);
      return {
        parts,
        update(v, active) {
          const on = active && v.phase !== 'call' && v.phase !== 'leaving';
          flare.visible = on;
          light.intensity = on ? 6 + Math.sin(performance.now() / 70) * 2 + Math.random() * 2 : 0;
        },
      };
    }
    return { parts, update() {} }; // rescue: the hostage is drawn as a soldier
  }

  // ---- a dropped drive
  const dropped = mesh(g.drive, mat);
  dropped.visible = false;
  const droppedLight = mesh(g.blink, mats.screenDone);
  droppedLight.visible = false;

  // ---- grenades in flight
  const flying = new Map(); // grenade id -> mesh
  const spin = new THREE.Euler();

  function clearStages() {
    for (const st of stages.values()) for (const o of st.parts) group.remove(o);
    stages.clear();
    chosen.clear();
  }

  return {
    group,
    /** @param {number} dt @param {number} alpha how far between the last two ticks */
    update(dt, alpha = 1) {
      for (const { c, stripe } of crates) stripe.material = c.left > 0 ? mat : mats.stripeEmpty;

      const v = op?.view;
      if (v && mission) {
        // Wound back (a retry, or Play again): forget the stages after this one.
        for (const index of [...stages.keys()]) {
          if (index > v.stage || (index === v.stage && chosen.get(index)?.join() !== v.sites.join() && v.sites.length)) {
            for (const o of stages.get(index).parts) group.remove(o);
            stages.delete(index);
            chosen.delete(index);
          }
        }
        if (v.state !== 'idle' && !chosen.has(v.stage)) {
          chosen.set(v.stage, [...v.sites]);
          stages.set(v.stage, build(v.stage, v.kind, v.sites));
        }
        for (const [index, st] of stages) st.update(v, index === v.stage && v.state === 'active');
        dropped.visible = !!v.drop;
        droppedLight.visible = !!v.drop && Math.floor(performance.now() / 500) % 2 === 0;
        if (v.drop) {
          dropped.position.set(v.drop.x, v.drop.y + 0.02, v.drop.z);
          droppedLight.position.set(v.drop.x, v.drop.y + 0.06, v.drop.z);
        }
      }

      // Grenades: drawn between their last two positions, tumbling as they fly.
      const list = session.grenades?.list ?? [];
      const live = new Set();
      for (const n of list) {
        live.add(n.id);
        let m = flying.get(n.id);
        if (!m) {
          m = mesh(g.grenade, mat);
          m.userData.spin = Math.random() * 6;
          flying.set(n.id, m);
        }
        const p = n.prev ?? n.pos;
        m.position.set(p.x + (n.pos.x - p.x) * alpha, p.y + (n.pos.y - p.y) * alpha + 0.04, p.z + (n.pos.z - p.z) * alpha);
        const speed = Math.hypot(n.vel.x, n.vel.y, n.vel.z);
        m.userData.spin += speed * dt * 2;
        m.rotation.copy(spin.set(m.userData.spin, m.userData.spin * 0.6, 0));
      }
      for (const [id, m] of flying) if (!live.has(id)) { group.remove(m); flying.delete(id); }
    },
    /** A restart from the very beginning: every stage's props go. */
    reset() { clearStages(); },
  };
}
