// AI debug views: seeing what the enemies "think".
//
// Game AI is invisible: a soldier just walks somewhere and you can't tell why.
// So AI programmers draw the AI's knowledge on top of the world:
//   nav grid     every walkable cell (green), with cut-off islands in grey
//   cover        cover points: yellow = low (crouch), orange = high (stand), with a tick towards the wall
//   paths        each enemy's current route
//   senses       vision cones coloured by awareness, plus a label with the brain state
//   noise        rings showing how far each noise carries
// Switch them on in the tuning panel (`): AI.

import * as THREE from 'three';

function labelSprite() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 11;
  s.userData = { canvas: c, text: '' };
  return s;
}

function setLabel(s, text, color) {
  if (s.userData.text === text) return;
  s.userData.text = text;
  const g = s.userData.canvas.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, 8, 256, 48);
  g.font = '600 30px "Barlow Condensed", sans-serif';
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  s.material.map.needsUpdate = true;
}

/**
 * @param {THREE.Scene} scene
 * @param {object} enemies  ai/enemies.js
 * @param {object} nav, cover, noise
 */
export function createAiDebug(scene, { enemies, nav, cover, noise }) {
  const group = new THREE.Group();
  group.name = 'ai-debug';
  scene.add(group);
  const options = { nav: false, cover: false, paths: false, senses: false, noise: false };
  let navPoints = null, coverLines = null;
  const perEnemy = new Map();

  function buildNav() {
    const pos = new Float32Array(nav.count * 3);
    const col = new Float32Array(nav.count * 3);
    const main = new THREE.Color('#5bd16a'), island = new THREE.Color('#7a7a7a');
    for (let c = 0; c < nav.count; c++) {
      pos.set([nav.X[c], nav.Y[c] + 0.04, nav.Z[c]], c * 3);
      const k = nav.component[c] === nav.main ? main : island;
      col.set([k.r, k.g, k.b], c * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    navPoints = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, vertexColors: true }));
    group.add(navPoints);
  }

  function buildCover() {
    const pts = [];
    const cols = [];
    const low = new THREE.Color('#ffd23f'), high = new THREE.Color('#ff8a2a');
    for (const p of cover.points) {
      const y = p.pos.y + 0.08;
      const k = p.high ? high : low;
      // A small cross at the spot and a tick towards the wall.
      pts.push(p.pos.x - 0.12, y, p.pos.z, p.pos.x + 0.12, y, p.pos.z, p.pos.x, y, p.pos.z - 0.12, p.pos.x, y, p.pos.z + 0.12);
      pts.push(p.pos.x, y, p.pos.z, p.pos.x + p.dir.x * 0.45, y, p.pos.z + p.dir.z * 0.45);
      for (let i = 0; i < 6; i++) cols.push(k.r, k.g, k.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    coverLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
    group.add(coverLines);
  }

  function enemyBits(e) {
    if (perEnemy.has(e)) return perEnemy.get(e);
    // Room for 64 points, reused every frame (no new buffers, no garbage).
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    const path = new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: '#4fd2ff' }));
    path.frustumCulled = false;
    const coneGeo = new THREE.BufferGeometry();
    coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(26 * 3), 3));
    const cone = new THREE.Line(coneGeo, new THREE.LineBasicMaterial({ color: '#ffffff' }));
    cone.frustumCulled = false;
    const label = labelSprite();
    group.add(path, cone, label);
    const bits = { path, cone, label };
    perEnemy.set(e, bits);
    return bits;
  }

  const rings = [];
  function ring() {
    const g = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i <= 48; i++) pts.push(Math.cos((i / 48) * Math.PI * 2), 0, Math.sin((i / 48) * Math.PI * 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const r = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#c58cff', transparent: true }));
    r.frustumCulled = false;
    group.add(r);
    rings.push(r);
    return r;
  }

  const awareColor = new THREE.Color();
  function update() {
    if (options.nav && !navPoints) buildNav();
    if (navPoints) navPoints.visible = options.nav;
    if (options.cover && !coverLines) buildCover();
    if (coverLines) coverLines.visible = options.cover;

    for (const [e, b] of perEnemy) if (!enemies.list.includes(e)) { group.remove(b.path, b.cone, b.label); perEnemy.delete(e); }
    for (const e of enemies.list) {
      const b = enemyBits(e);
      const alive = !e.dead;
      b.path.visible = options.paths && alive && e.path.points.length > 0;
      if (b.path.visible) {
        const arr = b.path.geometry.attributes.position.array;
        const pts = [e.pos, ...e.path.points.slice(e.path.index)].slice(0, 64);
        pts.forEach((p, i) => arr.set([p.x, p.y + 0.1, p.z], i * 3));
        b.path.geometry.setDrawRange(0, pts.length);
        b.path.geometry.attributes.position.needsUpdate = true;
      }
      b.cone.visible = options.senses && alive;
      b.label.visible = options.senses && alive;
      if (!b.cone.visible) continue;
      // The vision cone, drawn 8 m long at eye height.
      const eye = e.eye();
      const arr = b.cone.geometry.attributes.position.array;
      const half = (e.def.sight.fov / 2) * (Math.PI / 180);
      const R = 8;
      arr.set([eye.x, eye.y, eye.z], 0);
      for (let i = 0; i <= 23; i++) {
        const a = e.motor.yaw - half + (2 * half * i) / 23;
        arr.set([eye.x - Math.sin(a) * R, eye.y, eye.z - Math.cos(a) * R], (i + 1) * 3);
      }
      arr.set([eye.x, eye.y, eye.z], 25 * 3);
      b.cone.geometry.attributes.position.needsUpdate = true;
      const aw = e.senses.awareness;
      awareColor.set(e.inCombat ? '#ff4a3a' : aw > 0.35 ? '#ffb23f' : '#ffffff');
      b.cone.material.color.copy(awareColor);
      b.label.position.set(eye.x, eye.y + 0.75, eye.z);
      setLabel(b.label, `${e.brainState} ${Math.round(aw * 100)}%${enemies.tokens.has(e) ? ' ●' : ''}`, `#${awareColor.getHexString()}`);
    }

    // Noise rings.
    const list = options.noise ? noise.list : [];
    while (rings.length < list.length) ring();
    rings.forEach((r, i) => {
      const n = list[i];
      r.visible = !!n;
      if (!n) return;
      r.position.set(n.pos.x, n.pos.y + 0.1, n.pos.z);
      r.scale.set(n.radius, 1, n.radius);
      r.material.opacity = 1 - Math.min(1, (noise.now - n.time) / 0.5);
    });
  }

  return { options, update };
}
