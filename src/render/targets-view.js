// Draws the targets (and the gun racks) by reading the simulation state in
// src/world/targets.js each frame: tilting pop-ups, sliding movers, swinging
// steel plates, and a quick white flash when something is hit.

import * as THREE from 'three';
import { PERSON_ZONES, PLATE } from '../world/targets.js';
import { buildGun } from './gun-models.js';
import { WEAPONS } from '../weapons/weapons-data.js';
import { signTexture } from './signs.js';

const PAPER = '#e7dcc0';
const HOSTAGE = '#cfe1ee';

/** The printed face of a person target: scoring rings, or the hostage's "NO SHOOT". */
function faceTexture(hostage) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = hostage ? HOSTAGE : PAPER;
  g.fillRect(0, 0, 256, 512);
  g.strokeStyle = hostage ? '#2f6c9a' : '#3b3f36';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 244, 500);
  if (hostage) {
    g.fillStyle = '#2f6c9a';
    g.font = '700 54px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.fillText('NO', 128, 210);
    g.fillText('SHOOT', 128, 268);
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(40, 120); g.lineTo(216, 330); g.stroke();
  } else {
    // Scoring rings on the chest.
    g.lineWidth = 4;
    for (const r of [90, 60, 30]) {
      g.beginPath();
      g.ellipse(128, 190, r * 0.9, r, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#c4702f';
    g.beginPath();
    g.arc(128, 190, 10, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** `guns`: the loaded gun models for the racks (assets.model('guns')), or null for block-built ones. */
export function createTargetsView(scene, targets, racks = [], guns = null) {
  const group = new THREE.Group();
  group.name = 'targets';
  scene.add(group);

  const standMat = new THREE.MeshStandardMaterial({ color: '#4d5147', roughness: 0.8 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#5d6267', roughness: 0.35, metalness: 0.6 });
  const railMat = new THREE.MeshStandardMaterial({ color: '#3a3d36', roughness: 0.6, metalness: 0.4 });
  const faces = { paper: faceTexture(false), hostage: faceTexture(true) };

  const views = targets.list.map((t) => {
    const root = new THREE.Group();     // sits at the target's position, turned to face its way
    const hinge = new THREE.Group();    // tilts when the target falls or rises
    root.add(hinge);
    group.add(root);
    const flashMats = [];

    if (t.kind === 'steel') {
      // A plate hanging from a crossbar on two posts.
      const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE.size[0], PLATE.size[1], 0.03), steelMat.clone());
      const swing = new THREE.Group();
      swing.position.y = PLATE.y + PLATE.size[1] / 2 + 0.12;
      plate.position.y = -PLATE.size[1] / 2 - 0.12;
      swing.add(plate);
      hinge.add(swing);
      for (const sx of [-0.3, 0.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, PLATE.y + 0.5, 0.05), standMat);
        post.position.set(sx, (PLATE.y + 0.5) / 2, -0.05);
        root.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.05), standMat);
      bar.position.set(0, PLATE.y + 0.5, -0.05);
      root.add(bar);
      flashMats.push(plate.material);
      root.userData.swing = swing;
    } else {
      // A person-shaped board: legs, body and head, matching the hit zones.
      const mat = new THREE.MeshStandardMaterial({ map: faces[t.hostage ? 'hostage' : 'paper'], roughness: 0.9 });
      const back = new THREE.MeshStandardMaterial({ color: '#8f7b58', roughness: 0.9 });
      const totalH = 1.75;
      for (const z of PERSON_ZONES) {
        const [w, h] = z.size;
        const geo = new THREE.BoxGeometry(w, h, 0.03);
        // Map the face texture so the whole silhouette shares one picture.
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          const x = (uv.getX(i) - 0.5) * w;
          const y = z.y + (uv.getY(i) - 0.5) * h;
          uv.setXY(i, 0.5 + x / 0.5, y / totalH);
        }
        const mats = [back, back, back, back, mat, back];
        const m = new THREE.Mesh(geo, mats);
        m.position.y = z.y;
        m.castShadow = true;
        hinge.add(m);
      }
      flashMats.push(mat);
      // Stand: a base with a hinge bar (pop-ups) or two posts (paper).
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.3), standMat);
      base.position.y = 0.04;
      root.add(base);
      if (t.rail) {
        const dx = t.rail.to.x - t.home.x;
        const dz = t.rail.to.z - t.home.z;
        const len = Math.hypot(dx, dz);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.06, 0.12), railMat);
        rail.position.set(t.home.x + dx / 2, 0.03, t.home.z + dz / 2);
        rail.rotation.y = Math.atan2(-dz, dx);
        group.add(rail);
      }
    }
    return { t, root, hinge, flashMats };
  });

  // Gun racks: the guns lying on a table, with labels.
  for (const rack of racks) {
    const holder = new THREE.Group();
    holder.position.set(...rack.at);
    holder.rotation.y = rack.rotY;
    const step = rack.width / rack.weapons.length;
    rack.weapons.forEach((id, i) => {
      const def = WEAPONS[id];
      const gun = buildGun(def, { hands: false, guns }).group;
      // Lying on its left side, muzzle to the left. three.js turns about z, then
      // y, then x: y swings the muzzle (-z) round to the left (-x), then x rolls the
      // gun's right side (+x) to face up. (Until M6 this said (90°, 0, 90°), which
      // stood every gun on its stock, muzzle up: the order matters. Lesson 18.)
      // So the gun's own z runs along the table and its x points up: centre it on
      // its label, resting on the table.
      const box = new THREE.Box3().setFromObject(gun);
      gun.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      gun.position.set(-rack.width / 2 + step * (i + 0.5) - (box.min.z + box.max.z) / 2, 0.005 - box.min.x, 0.05);
      gun.traverse((o) => { o.castShadow = true; });
      holder.add(gun);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(step * 0.9, 0.12),
        new THREE.MeshStandardMaterial({ map: signTexture({ title: `${def.slot} · ${def.name.toUpperCase()}`, size: [step * 0.9, 0.12] }), roughness: 0.8 }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(-rack.width / 2 + step * (i + 0.5), 0.005, 0.27);
      holder.add(label);
    });
    group.add(holder);
  }

  function update(dt) {
    for (const v of views) {
      const t = v.t;
      v.root.position.set(t.pos.x, t.pos.y, t.pos.z);
      v.root.rotation.y = t.rotY;
      v.hinge.rotation.x = t.tilt;
      // White flash for a moment after a hit.
      const glow = Math.max(0, 1 - t.lastHit / 0.12);
      for (const m of v.flashMats) {
        m.emissive.setRGB(glow * 0.6, glow * 0.6, glow * 0.6);
      }
      // Steel plates swing back on their hook and settle.
      const swing = v.root.userData.swing;
      if (swing) swing.rotation.x = -Math.exp(-t.lastHit * 5) * Math.sin(t.lastHit * 18) * 0.45 * (t.hitCount ? 1 : 0);
    }
  }

  return { update };
}
