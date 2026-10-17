// The guns you see: real models when they've loaded, block-built ones if not.
//
// Real models come from a free (CC0) pack, built into assets/models/guns.glb by
// tools/build-models.mjs. A model is just a shape: it doesn't know where you
// hold it or where the bullets come out. GUN_MODELS writes that down for each
// gun, measured once from side views of the model, like marking a toy's
// handholds with stickers.
//
// Block-built guns (the fallback, and what the tests use): each gun's
// `model.parts` list (in weapons-data.js) becomes a little model made of boxes
// and cylinders.
//
// Either way you get chunky gloved hands, and parts with a name (mag, slide,
// pump) are kept separately so the viewmodel can animate them: the magazine
// drops out during a reload, the pistol's slide snaps back when it fires, the
// shotgun's pump slides back and forth.
//
// Gun space: the grip (where the right hand holds) is the origin; x right, y up,
// -z towards the muzzle. Units are metres.

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

/**
 * Where things are on each model gun, in the model's own space (as guns.glb
 * stores it: standing on y = 0, centred, the barrel along -z). `buildGun` moves
 * the model so its grip is the origin, like the block-built guns.
 *   grip     where the right hand holds
 *   sight    the point your eye lines up when aiming (on the sight line)
 *   muzzle   where the bullets (and the flash) come out
 *   eject    where spent shells fly out
 *   support  where the left hand holds (null: both hands on the grip)
 *   laser    where a marksman's laser starts (render/soldiers-view.js)
 *   reticle  how you aim through it without an optic: 'irons', 'bead', or 'scope' (built in)
 * The DMR is only carried by enemy marksmen, so nobody looks through its scope:
 * give it to the player and the viewmodel would need a scope view.
 */
export const GUN_MODELS = {
  carbine: {
    grip: [0, 0.2, 0.13], sight: [0, 0.316, 0.1], muzzle: [0, 0.2415, -0.43],
    eject: [0.024, 0.25, 0.03], support: [0, 0.215, -0.17], reticle: 'irons',
  },
  smg: {
    grip: [0, 0.17, 0.045], sight: [0, 0.285, 0.07], muzzle: [0, 0.219, -0.31],
    eject: [0.024, 0.22, -0.02], support: [0, 0.185, -0.17], reticle: 'irons',
  },
  shotgun: {
    grip: [0, 0.085, 0.2], sight: [0, 0.178, 0.1], muzzle: [0, 0.15, -0.5],
    eject: [0.024, 0.13, 0], support: [0, 0.085, -0.2], reticle: 'bead',
  },
  pistol: {
    grip: [0, 0.08, 0.06], sight: [0, 0.134, 0.07], muzzle: [0, 0.112, -0.105],
    eject: [0.019, 0.125, -0.035], support: null, reticle: 'irons',
  },
  dmr: {
    grip: [0, 0.13, 0.28], sight: [0, 0.219, 0.3], muzzle: [0, 0.171, -0.579],
    eject: [0.03, 0.18, 0.2], support: [0, 0.12, -0.05], laser: [0.04, 0.14, -0.15], reticle: 'scope',
  },
};

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

/** The glowing reticle you aim with: a red dot (or a scope's glass), or nothing extra for iron sights. */
function reticle(kind, sight, glassSize = 0.04) {
  if (kind !== 'dot' && kind !== 'scope') return null;
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0022, 16),
    new THREE.MeshBasicMaterial({ color: '#ff3b30', toneMapped: false }),
  );
  dot.position.set(sight[0], sight[1], sight[2] - 0.03);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(glassSize, glassSize),
    new THREE.MeshBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.12, depthWrite: false }),
  );
  glass.position.set(sight[0], sight[1], sight[2] - 0.031);
  const g = new THREE.Group();
  g.add(glass, dot);
  return g;
}

/** The model gun for `def` from the loaded guns.glb, or null if there isn't one. */
function modelGun(def, guns, group, parts) {
  const spec = GUN_MODELS[def.id];
  const src = spec && guns?.scene.getObjectByName(def.id);
  if (!src?.isMesh) return null;
  const grip = new THREE.Vector3(...spec.grip);
  const at = (p) => (p ? new THREE.Vector3(...p).sub(grip) : null);
  // The geometry and material are shared by every copy (it's the same shape);
  // only the position is ours. Moving parts get a pivot each, like the block guns.
  const place = (mesh) => {
    const m = new THREE.Mesh(mesh.geometry, mesh.material);
    m.position.copy(grip).negate();
    return m;
  };
  group.add(place(src));
  for (const child of src.children) {
    const name = child.name.slice(def.id.length + 1);
    if (!child.isMesh || !name) continue;
    const pivot = new THREE.Group();
    pivot.add(place(child));
    pivot.userData.rest = new THREE.Vector3();
    parts[name] = pivot;
    group.add(pivot);
  }
  return {
    sight: at(spec.sight), muzzle: at(spec.muzzle), eject: at(spec.eject),
    support: at(spec.support), laser: at(spec.laser), reticle: spec.reticle,
  };
}

/**
 * Builds one gun.
 * @param {object} def a row from WEAPONS
 * @param {{hands?:boolean, guns?:object}} [opts] hands: false for guns lying on a
 *   table or in a soldier's hands; guns: the loaded guns.glb (assets.model('guns'))
 *   to use the real models, or nothing for block-built guns.
 * @returns {{group, parts, muzzle, eject, sight, hip, support, laser, reticle, kind}}
 *   points are Vector3s in gun space; hip is where the grip sits on screen when
 *   firing from the hip; support and laser may be null.
 */
export function buildGun(def, { hands = true, guns = null } = {}) {
  const m = def.model;
  const group = new THREE.Group();
  group.name = def.id;
  const parts = {};

  const real = modelGun(def, guns, group, parts);
  if (real) {
    const out = { kind: 'model', group, parts, ...real, hip: new THREE.Vector3(...m.hip) };
    fitAttachments(out, def);
    if (hands) addHands(group, out.support);
    group.traverse((o) => { o.frustumCulled = false; });
    return out;
  }

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

  // (The block carbine and DMR have their own red dot built in; with an optic fitted, that's replaced.)
  const ret = def.attachments?.optic ? null : reticle(m.reticle, m.sight);
  if (ret) group.add(ret);

  const laser = m.parts.find((p) => p.name === 'laser');
  const out = {
    kind: 'blocks',
    group,
    parts,
    muzzle: new THREE.Vector3(...m.muzzle),
    eject: new THREE.Vector3(...m.eject),
    sight: new THREE.Vector3(...m.sight),
    hip: new THREE.Vector3(...m.hip),
    support: m.support ? new THREE.Vector3(...m.support) : null,
    laser: laser ? new THREE.Vector3(...laser.at) : null,
    reticle: m.reticle,
  };
  fitAttachments(out, def);
  if (hands) addHands(group, out.support);
  group.traverse((o) => { o.frustumCulled = false; });
  return out;
}

/**
 * Draws a gun's attachments (weapons/attachments.js `def.attachments`) at its
 * points, code-built like the gear on the soldiers, and moves the points they
 * change (a suppressor moves the muzzle forward; a scope changes how you aim).
 */
function fitAttachments(g, def) {
  const a = def.attachments ?? {};
  const add = (mesh, at) => { mesh.position.copy(at); g.group.add(mesh); return mesh; };
  const cylZ = (r, len, color) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), material(color));
    m.rotation.x = Math.PI / 2; // along the barrel
    return m;
  };
  const s = g.sight;
  // ---- optics
  if (a.optic === 'reddot') {
    add(hollowBox([0.036, 0.032, 0.045], 'dark', 0.006), s);
    g.group.add(reticle('dot', s.toArray(), 0.026));
  } else if (a.optic === 'holo') {
    add(hollowBox([0.05, 0.04, 0.035], 'dark', 0.005), s);
    add(boxMesh([0.05, 0.012, 0.06], 'dark'), s.clone().add(new THREE.Vector3(0, -0.026, 0.01))); // its base
    g.group.add(reticle('dot', s.toArray(), 0.038));
  } else if (a.optic === 'scope') {
    add(cylZ(0.019, 0.17, 'dark'), s.clone().add(new THREE.Vector3(0, 0, -0.03)));
    add(cylZ(0.026, 0.045, 'dark'), s.clone().add(new THREE.Vector3(0, 0, -0.13)));  // the front lens bell
    add(cylZ(0.024, 0.03, 'dark'), s.clone().add(new THREE.Vector3(0, 0, 0.06)));    // the eyepiece
    for (const z of [-0.07, 0.01]) add(boxMesh([0.014, 0.03, 0.012], 'dark'), s.clone().add(new THREE.Vector3(0, -0.028, z)));
    g.reticle = 'scope'; // aimed all the way, you look through it (the HUD's scope view)
  }
  // ---- muzzle
  if (a.muzzle === 'suppressor') {
    add(cylZ(0.019, 0.16, 'dark'), g.muzzle.clone().add(new THREE.Vector3(0, 0, -0.08)));
    g.muzzle = g.muzzle.clone().add(new THREE.Vector3(0, 0, -0.16));
    g.suppressed = true;
  } else if (a.muzzle === 'compensator') {
    add(boxMesh([0.03, 0.03, 0.05], 'metal'), g.muzzle.clone().add(new THREE.Vector3(0, 0, -0.025)));
    g.muzzle = g.muzzle.clone().add(new THREE.Vector3(0, 0, -0.05));
  }
  // ---- magazine: an extended one is longer at the bottom (and drops out with the rest of it)
  if (a.mag === 'extended' && g.parts.mag) {
    const box = new THREE.Box3().setFromObject(g.parts.mag);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const ext = boxMesh([size.x * 0.95, 0.05, size.z * 0.9], 'dark');
      ext.position.set((box.min.x + box.max.x) / 2, box.min.y - 0.022, (box.min.z + box.max.z) / 2);
      g.parts.mag.add(ext);
    }
  }
  // ---- underbarrel
  const sup = g.support ?? new THREE.Vector3(0, -0.02, -0.25);
  if (a.under === 'foregrip') {
    add(boxMesh([0.026, 0.075, 0.032], 'dark'), sup.clone().add(new THREE.Vector3(0, -0.045, 0)));
  } else if (a.under === 'laser') {
    const at = sup.clone().add(new THREE.Vector3(0.028, 0.012, -0.06));
    add(boxMesh([0.018, 0.022, 0.06], 'dark'), at);
    add(boxMesh([0.008, 0.008, 0.004], 'accent'), at.clone().add(new THREE.Vector3(0, 0, -0.031)));
    g.laser = at.clone().add(new THREE.Vector3(0, 0, -0.03));
  }
}

function addHands(group, support) {
  // Right hand on the grip, arm reaching back towards the bottom-right of the screen.
  group.add(arm([0.0, -0.05, 0.02], [0.055, 0.075, 0.1], [0.03, -0.16, 0.22], [0.55, 0.12, 0]));
  if (support) {
    // Left hand on the front grip, arm reaching back to the bottom-left.
    const { x: sx, y: sy, z: sz } = support;
    group.add(arm([sx, sy - 0.035, sz], [0.075, 0.055, 0.1], [sx - 0.1, sy - 0.15, sz + 0.2], [0.5, -0.45, 0]));
  } else {
    // Pistol: the left hand cups the right.
    group.add(arm([-0.012, -0.075, 0.02], [0.05, 0.06, 0.095], [-0.09, -0.19, 0.22], [0.55, -0.35, 0]));
  }
}
