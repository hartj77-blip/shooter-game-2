// The night, drawn: lamps and their pools of light, and the enemies' flashlights.
//
// Real lights are expensive: every light in the scene adds work for every pixel
// of everything it might touch, and changing how many there are makes three.js
// rebuild its shaders (a stutter). So, like a theatre with only a few spotlights
// to go round, there are always exactly LIGHTS real spotlights, and each frame
// they're handed to whichever lamps and torches are nearest you. Everything
// else is FAKED, and faked well:
//   - a lamp's bulb is a little shape that glows (bright enough to bloom on high)
//   - the pool of light under it is a soft, see-through disc painted on the ground
//   - a torch beam is a faint, see-through cone (one mesh for all of them:
//     an "instanced" mesh, many copies in one draw call)
//
// The light the ENEMIES judge by is a separate, simple sum (world/lighting.js),
// worked out by the host; this only has to look right. Presentation only.

import * as THREE from 'three';

export const NIGHT_VIEW = {
  lights: 6,              // real spotlights to share round
  lampColor: '#ffcf8a',
  lampIntensity: 60,      // candela-ish (three.js uses real light units)
  torchColor: '#e8f0ff',
  torchIntensity: 140,
  torchRange: 22,         // metres (world/lighting.js flashlightRange)
  torchCone: 14,          // degrees either side (world/lighting.js flashlightCone)
  beamLength: 9,          // metres of visible beam
  beamOpacity: 0.08,
  poolOpacity: 0.32,
};

const DEG = Math.PI / 180;

/** A soft round spot, bright in the middle and fading to nothing: the pool of lamplight. */
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} opts
 * @param {THREE.Object3D} opts.scene
 * @param {Array} opts.lamps          the level's lamps (world/kit.js `lamp`: { at, radius })
 * @param {object} [opts.soldiers]    render/soldiers-view.js for the enemies (their torches)
 * @param {THREE.Camera} opts.camera
 */
export function createNightView({ scene, lamps, soldiers = null, camera }) {
  const T = NIGHT_VIEW;
  const group = new THREE.Group();
  group.name = 'night';
  scene.add(group);

  // ---- lamps: glowing bulbs and pools on the ground, each set merged into one mesh
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(T.lampColor).multiplyScalar(4), toneMapped: false });
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTexture(), color: T.lampColor, transparent: true, opacity: T.poolOpacity,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  if (lamps.length) {
    const bulbs = [], pools = [];
    for (const l of lamps) {
      const b = new THREE.BoxGeometry(0.26, 0.03, 0.34).translate(l.at[0], l.at[1] - 0.04, l.at[2]);
      bulbs.push(b.toNonIndexed());
      const r = l.radius * 0.85;
      // (On the floor under the lamp. Ground level is assumed to be 0: lamps stand outside.)
      pools.push(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).translate(l.at[0], 0.02, l.at[2]));
    }
    const bulbGeo = new THREE.BufferGeometry();
    bulbGeo.setAttribute('position', mergePlain(bulbs));
    group.add(new THREE.Mesh(bulbGeo, bulbMat));
    const poolGeo = mergeUV(pools);
    group.add(new THREE.Mesh(poolGeo, poolMat));
  }

  // ---- torch beams: one instanced cone, up to 32 copies
  const beamGeo = new THREE.ConeGeometry(Math.tan(T.torchCone * DEG) * T.beamLength, T.beamLength, 16, 1, true)
    .translate(0, -T.beamLength / 2, 0)   // tip at the origin, opening downwards...
    .rotateX(Math.PI / 2);                // ...turned to open forwards (-Z), like a gun's aim
  // Brightest at the torch, fading to nothing at the far end (added light: black adds nothing).
  {
    const p = beamGeo.attributes.position;
    const fade = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) fade.fill(Math.pow(1 + p.getZ(i) / T.beamLength, 2), i * 3, i * 3 + 3);
    beamGeo.setAttribute('color', new THREE.BufferAttribute(fade, 3));
  }
  const beamMat = new THREE.MeshBasicMaterial({
    color: T.torchColor, vertexColors: true, transparent: true, opacity: T.beamOpacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const MAX_BEAMS = 32;
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, MAX_BEAMS);
  beams.count = 0;
  beams.frustumCulled = false;
  group.add(beams);

  // ---- the shared real lights
  const lights = Array.from({ length: T.lights }, () => {
    const s = new THREE.SpotLight('#ffffff', 0, 20, 0.6, 0.5, 1.2);
    s.castShadow = false;
    group.add(s, s.target);
    return s;
  });

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  function update() {
    // Who's carrying a torch, where, pointing where.
    const torches = [];
    if (soldiers) {
      for (const v of soldiers.views.values()) {
        if (v.dead || !v.model.root.visible) continue;
        v.model.muzzle.getWorldPosition(pos);
        v.model.parts.gun.getWorldQuaternion(q);
        dir.set(0, 0, -1).applyQuaternion(q);
        torches.push({ at: pos.clone(), dir: dir.clone(), q: q.clone() });
        if (torches.length >= MAX_BEAMS) break;
      }
    }
    beams.count = torches.length;
    torches.forEach((t, i) => beams.setMatrixAt(i, m4.compose(t.at, t.q, one)));
    beams.instanceMatrix.needsUpdate = true;

    // Hand the real lights to the nearest sources (torches count as a little nearer: they move, so you notice them).
    const me = camera.position;
    const sources = [
      ...lamps.map((l) => ({ kind: 'lamp', l, d: Math.hypot(l.at[0] - me.x, l.at[2] - me.z) })),
      ...torches.map((t) => ({ kind: 'torch', t, d: t.at.distanceTo(me) * 0.7 })),
    ].sort((a, b) => a.d - b.d);
    lights.forEach((s, i) => {
      const src = sources[i];
      if (!src || src.d > 60) { s.intensity = 0; return; }
      if (src.kind === 'lamp') {
        const l = src.l;
        s.color.set(T.lampColor);
        s.intensity = T.lampIntensity;
        s.distance = l.radius * 1.8;
        s.angle = 1.0;
        s.position.set(l.at[0], l.at[1] - 0.05, l.at[2]);
        s.target.position.set(l.at[0], 0, l.at[2]);
      } else {
        const t = src.t;
        s.color.set(T.torchColor);
        s.intensity = T.torchIntensity;
        s.distance = T.torchRange;
        s.angle = T.torchCone * DEG;
        s.position.copy(t.at);
        s.target.position.copy(t.at).addScaledVector(t.dir, 5);
      }
      s.target.updateMatrixWorld();
    });
  }

  return {
    group,
    update,
    dispose() {
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose(); });
      for (const mt of [bulbMat, poolMat, beamMat]) { mt.map?.dispose(); mt.dispose(); }
      beams.dispose();
    },
  };
}

/** Joins position-only geometries. */
function mergePlain(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const out = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { out.set(g.attributes.position.array, o); o += g.attributes.position.array.length; g.dispose(); }
  return new THREE.BufferAttribute(out, 3);
}

/** Joins indexed planes (position + uv) into one non-indexed geometry. */
function mergeUV(list) {
  const flat = list.map((g) => { const f = g.toNonIndexed(); g.dispose(); return f; });
  let n = 0;
  for (const g of flat) n += g.attributes.position.count;
  const p = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of flat) {
    p.set(g.attributes.position.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
