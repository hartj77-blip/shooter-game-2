// Merging small shapes into one: fewer things for the graphics card to draw.
//
// Every separate mesh is a separate "draw call": a request to the graphics
// card. A block soldier is about 25 boxes; 16 soldiers would be 400 draw calls,
// which is slow. So the boxes that always move together (all of a soldier's
// torso, all of its head) are glued into one shape, with each box's colour
// painted onto its corners ("vertex colours"). One draw call per body part.

import * as THREE from 'three';

const tmpColor = new THREE.Color();

/** Bakes a colour into every corner of a geometry. */
function paint(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  tmpColor.set(color); // three.js turns the '#rrggbb' colour into the linear values the shader wants
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Joins painted geometries (all non-indexed, with positions, normals and colours) into one. */
export function mergeGeometries(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * Joins textured geometries (non-indexed, with positions, normals and UVs, already
 * placed in the world) into one: the level's batches (render/level-view.js).
 */
export function mergeTextured(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3(1, 1, 1);

/**
 * One painted box. `size` [w, h, d], `at` its centre, optional `rot` [x, y, z] radians.
 */
export function paintedBox(size, at, color, rot = null) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  q.setFromEuler(e.set(...(rot ?? [0, 0, 0])));
  g.applyMatrix4(m4.compose(v.set(...at), q, s));
  return paint(g, color);
}

/** A box stretched from point `a` to point `b` (an arm, a strap), `thick` [w, h] across. */
export function paintedLimb(a, b, thick, color) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const len = from.distanceTo(to);
  const g = new THREE.BoxGeometry(thick[0], thick[1], len);
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
  g.applyMatrix4(m4.compose(from.clone().add(to).multiplyScalar(0.5), q, s));
  return paint(g, color);
}

/**
 * Flattens every solid mesh inside `group` (like a gun from gun-models.js) into
 * one painted geometry, in the group's own space. See-through parts are skipped.
 */
export function flatten(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [];
  group.traverse((o) => {
    if (!o.isMesh || o.material.transparent || !o.material.color) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    // A model painted at build time (its colours on its corners) keeps them.
    if (o.material.vertexColors && g.attributes.color) parts.push(g.index ? g.toNonIndexed() : g);
    else parts.push(paint(g, `#${o.material.color.getHexString()}`));
  });
  return mergeGeometries(parts);
}
