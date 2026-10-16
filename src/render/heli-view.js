// The helicopter that takes you home, built from boxes.
//
// Where it is comes from heliPath() in game/helicopter.js: a fixed route worked
// out from the mission's clock, so every screen draws it in the same place. This
// file only builds the model, spins the rotors and puts it where the path says.
// A co-op client hears the helicopter's time only in snapshots, so between them
// it counts the time on by itself (and catches up if it drifts).
//
// It has no collider: you board by standing on the pad (HELI.board), and the
// game never has to ask "did that bullet hit the helicopter?".

import * as THREE from 'three';
import { heliPath, HELI } from '../game/helicopter.js';
import { paintedBox, mergeGeometries } from './merge.js';
import { soldierMaterial } from './soldier-model.js';

const OLIVE = '#4f5a3c', DARK = '#262a24', GLASS = '#6f94a6', SKID = '#1d1f1c';

function bodyGeometry() {
  // The nose points along +Z: with the model turned to the path's yaw, that's the way it flies.
  return mergeGeometries([
    // skids and struts
    paintedBox([0.12, 0.12, 4.4], [1.15, 0.06, 0.2], SKID), paintedBox([0.12, 0.12, 4.4], [-1.15, 0.06, 0.2], SKID),
    ...[[1, 1.2], [-1, 1.2], [1, -0.9], [-1, -0.9]].map(([x, z]) => paintedBox([0.1, 0.62, 0.1], [x, 0.4, z], SKID)),
    // the cabin, open at the sides (where you climb in)
    paintedBox([2.3, 0.25, 4.2], [0, 0.82, 0], OLIVE),                 // floor
    paintedBox([2.3, 0.2, 4.2], [0, 2.55, 0], OLIVE),                  // roof
    paintedBox([2.3, 1.55, 0.2], [0, 1.7, -2.0], OLIVE),               // back wall
    paintedBox([0.2, 1.55, 0.25], [1.05, 1.7, 0.4], OLIVE), paintedBox([0.2, 1.55, 0.25], [-1.05, 1.7, 0.4], OLIVE), // door pillars
    paintedBox([2.25, 0.05, 2.0], [0, 0.97, -0.9], DARK),               // a dark floor mat
    paintedBox([2.0, 0.45, 0.5], [0, 1.2, -1.6], DARK),                 // the bench
    // the nose and cockpit
    paintedBox([2.2, 1.0, 1.6], [0, 1.3, 2.9], OLIVE),
    paintedBox([2.0, 0.9, 1.3], [0, 2.1, 2.75], GLASS, [-0.25, 0, 0]),
    paintedBox([2.3, 1.75, 0.15], [0, 1.65, 2.05], DARK),               // the bulkhead behind the pilots
    // engine, mast and tail
    paintedBox([1.4, 0.65, 2.6], [0, 2.95, -0.5], DARK),
    paintedBox([0.2, 0.45, 0.2], [0, 3.45, 0], DARK),
    paintedBox([0.55, 0.55, 5.6], [0, 2.35, -4.8], OLIVE),
    paintedBox([0.56, 0.56, 0.5], [0, 2.35, -6.2], '#d8d8d0'),          // a pale band on the tail
    paintedBox([0.12, 1.5, 0.9], [0, 3.0, -7.4], OLIVE),
    paintedBox([1.8, 0.08, 0.55], [0, 2.4, -6.8], OLIVE),
  ]);
}

/**
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene
 * @param {object} opts.session  net/host.js or net/client.js (its operation and level)
 */
export function createHeliView({ scene, session }) {
  const op = session.operation;
  const lzs = session.level.expanded.lzs;
  const mat = soldierMaterial();
  const root = new THREE.Group();
  root.name = 'helicopter';
  root.visible = false;
  scene.add(root);

  const body = new THREE.Mesh(bodyGeometry(), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // Main rotor: two long blades, plus a faint disc for the blur you see when they spin fast.
  const rotor = new THREE.Group();
  rotor.position.set(0, 3.72, 0);
  rotor.add(new THREE.Mesh(mergeGeometries([
    paintedBox([11, 0.05, 0.32], [0, 0, 0], DARK), paintedBox([0.32, 0.05, 11], [0, 0, 0], DARK),
    paintedBox([0.5, 0.18, 0.5], [0, 0, 0], DARK),
  ]), mat));
  const blurMat = new THREE.MeshBasicMaterial({ color: '#1b1d1a', transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40).rotateX(-Math.PI / 2), blurMat);
  rotor.add(blur);
  root.add(rotor);
  const tail = new THREE.Group();
  tail.position.set(0.12, 3.0, -7.5);
  tail.add(new THREE.Mesh(mergeGeometries([paintedBox([0.04, 1.6, 0.16], [0, 0, 0], DARK), paintedBox([0.04, 0.16, 1.6], [0, 0, 0], DARK)]), mat));
  root.add(tail);

  // A light on the belly that blinks, so you can spot it coming in.
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3a2a', toneMapped: false }));
  beacon.position.set(0, 0.7, -1.0);
  root.add(beacon);

  let phase = null;
  let t = 0;
  /** What the rotor sound needs (audio/game-sounds.js). */
  const state = { here: false, pos: new THREE.Vector3() };

  return {
    root,
    state,
    update(dt) {
      const v = op?.view;
      const h = v?.heli;
      if (!h?.phase || v.state === 'failed') {
        root.visible = false;
        state.here = false;
        phase = null;
        return;
      }
      // Count the time on here; follow the mission's clock when it says otherwise
      // (after it lifts off for good, just let it fly away).
      if (h.phase !== phase) { phase = h.phase; t = h.t; } else {
        t += dt;
        if (v.state === 'active' && Math.abs(t - h.t) > 0.4) t = h.t;
      }
      const lz = lzs.find((l) => l.id === v.lz) ?? lzs[0];
      const p = heliPath(lz, phase, t, h.inbound || HELI.inbound);
      root.visible = p.here;
      state.here = p.here;
      root.position.set(p.pos.x, p.pos.y, p.pos.z);
      root.rotation.set(p.lean, p.yaw, 0, 'YXZ');
      state.pos.copy(root.position).y += 2;
      // Blades: a little slower while it sits on the pad, so you can see them go round.
      const speed = phase === 'landed' ? 18 : 28;
      rotor.rotation.y += speed * dt;
      tail.rotation.x += speed * 1.6 * dt;
      beacon.visible = Math.floor(performance.now() / 600) % 2 === 0;
    },
  };
}
