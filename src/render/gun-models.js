// Block-built guns: each gun's `model.parts` list (in weapons-data.js) becomes
// a little 3D model made of boxes and cylinders, plus chunky gloved hands.
//
// Parts with a `name` (mag, slide, pump) are kept separately so the viewmodel
// can animate them: the magazine drops out during a reload, the pistol's slide
// snaps back when it fires, the shotgun's pump slides back and forth.
//
// Model space: x right, y up, -z towards the muzzle. Units are metres.

import * as THREE from 'three';
import { GUN_COLORS } from '../weapons/weapons-data.js';

const materials = new Map();
function material(color) {
  if (!materials.has(color)) {
    const metal = color === 'metal' || color === 'dark';
    materials.set(color, new THREE.MeshStandardMaterial({
      color: GUN_COLORS[color] ?? color,
      roughness: metal ? 0.45 : 0.75,
      metalness: metal ? 0.35 : 0.05,
    }));
  }
  return materials.get(color);
}

const SLEEVE = '#4b5638';
const GLOVE = '#2a2c27';

function boxMesh([w, h, d], color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
}

/** A box with a rectangular hole through it along z, like a red-dot sight's housing. */
function hollowBox([w, h, d], color, wall = 0.008) {
  const g = new THREE.Group();
  const bars = [
    [[w, wall, d], [0, h / 2 - wall / 2, 0]],
    [[w, wall, d], [0, -h / 2 + wall / 2, 0]],
    [[wall, h, d], [w / 2 - wall / 2, 0, 0]],
    [[wall, h, d], [-w / 2 + wall / 2, 0, 0]],
  ];
  for (const [size, at] of bars) {
    const m = boxMesh(size, color);
    m.position.set(...at);
    g.add(m);
  }
  return g;
}

/** A rear sight with a notch in the middle to line the front post up in. */
function notchedSight([w, h, d], color, gap = 0.009) {
  const g = new THREE.Group();
  const side = (w - gap) / 2;
  for (const sx of [-1, 1]) {
    const m = boxMesh([side, h, d], color);
    m.position.x = sx * (gap / 2 + side / 2);
    g.add(m);
  }
  return g;
}

function partMesh(p) {
  let mesh;
  if (p.cyl) {
    const [r, len] = p.cyl;
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), material(p.color));
    mesh.rotation.x = Math.PI / 2; // cylinders stand up by default; lay them along z
    const holder = new THREE.Group();
    holder.add(mesh);
    mesh = holder;
  } else if (p.hollow) {
    mesh = hollowBox(p.box, p.color);
  } else if (p.notch) {
    mesh = notchedSight(p.box, p.color);
  } else {
    mesh = boxMesh(p.box, p.color);
  }
  mesh.position.set(...p.at);
  if (p.rot) mesh.rotation.set(...p.rot);
  return mesh;
}

function arm(handAt, handSize, sleeveAt, sleeveRot) {
  const g = new THREE.Group();
  const glove = boxMesh(handSize, GLOVE);
  glove.position.set(...handAt);
  const sleeve = boxMesh([0.066, 0.07, 0.38], SLEEVE);
  sleeve.position.set(...sleeveAt);
  sleeve.rotation.set(...sleeveRot);
  g.add(glove, sleeve);
  return g;
}

/** The glowing reticle you aim with: a red dot, or nothing extra for iron sights. */
function reticle(kind, sight) {
  if (kind !== 'dot') return null;
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0022, 16),
    new THREE.MeshBasicMaterial({ color: '#ff3b30', toneMapped: false }),
  );
  dot.position.set(sight[0], sight[1], sight[2] - 0.03);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.12, depthWrite: false }),
  );
  glass.position.set(sight[0], sight[1], sight[2] - 0.031);
  const g = new THREE.Group();
  g.add(glass, dot);
  return g;
}

/**
 * Builds the viewmodel for one gun.
 * @param {object} def a row from WEAPONS
 * @param {{hands?:boolean}} [opts] hands: false for guns lying on a table
 */
export function buildGun(def, { hands = true } = {}) {
  const m = def.model;
  const group = new THREE.Group();
  group.name = def.id;
  const parts = {};

  for (const p of m.parts) {
    const mesh = partMesh(p);
    if (p.name) {
      // Named parts get their own pivot so they can move on their own.
      const pivot = new THREE.Group();
      pivot.add(mesh);
      pivot.userData.rest = new THREE.Vector3();
      parts[p.name] = pivot;
      group.add(pivot);
    } else {
      group.add(mesh);
    }
  }

  const ret = reticle(m.reticle, m.sight);
  if (ret) group.add(ret);

  if (hands) {
    // Right hand on the grip, arm reaching back towards the bottom-right of the screen.
    group.add(arm([0.0, -0.05, 0.02], [0.055, 0.075, 0.1], [0.03, -0.16, 0.22], [0.55, 0.12, 0]));
    if (m.support) {
      // Left hand on the front grip, arm reaching back to the bottom-left.
      const [sx, sy, sz] = m.support;
      group.add(arm([sx, sy - 0.035, sz], [0.075, 0.055, 0.1], [sx - 0.1, sy - 0.15, sz + 0.2], [0.5, -0.45, 0]));
    } else {
      // Pistol: the left hand cups the right.
      group.add(arm([-0.012, -0.075, 0.02], [0.05, 0.06, 0.095], [-0.09, -0.19, 0.22], [0.55, -0.35, 0]));
    }
  }

  group.traverse((o) => { o.frustumCulled = false; });

  return {
    group,
    parts,
    muzzle: new THREE.Vector3(...m.muzzle),
    eject: new THREE.Vector3(...m.eject),
    sight: new THREE.Vector3(...m.sight),
  };
}
