// Level view: builds the meshes you see from the same shape descriptions the
// physics uses (src/world/kit.js), so the picture always matches the colliders.

import * as THREE from 'three';
import { wedgePoints, WEDGE_TRIANGLES } from '../world/kit.js';
import { signTexture } from './signs.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Gives every triangle "planar" texture coordinates measured in world metres,
 * so the 1 m grid texture lines up across neighbouring pieces and never stretches,
 * even on ramps. (Texture coordinates, or UVs, say which part of the image goes
 * on which part of a surface.)
 */
function worldGridUVs(geometry, position, rotY) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), p = new THREE.Vector3();
  const toWorld = (vec, i) => vec.fromBufferAttribute(pos, i).applyAxisAngle(UP, rotY).add(position);

  for (let i = 0; i < pos.count; i += 3) {
    toWorld(a, i); toWorld(b, i + 1); toWorld(c, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    if (Math.abs(n.y) > 0.99) u.set(1, 0, 0);       // floors and ceilings: x across
    else u.crossVectors(UP, n).normalize();          // walls and slopes: horizontal across
    v.crossVectors(n, u);
    for (let k = 0; k < 3; k++) {
      toWorld(p, i + k);
      uv[(i + k) * 2] = p.dot(u);
      uv[(i + k) * 2 + 1] = p.dot(v);
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function wedgeGeometry(width, length, height) {
  const pts = wedgePoints(width, length, height);
  const positions = WEDGE_TRIANGLES.flatMap((tri) => tri.flatMap((k) => pts[k]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

export function buildLevelView(expanded, materials) {
  const group = new THREE.Group();
  group.name = 'level';

  for (const solid of expanded.solids) {
    if (solid.hidden) continue; // invisible walls at the map's edge: felt, not seen
    const geometry = solid.kind === 'box'
      ? new THREE.BoxGeometry(...solid.size).toNonIndexed()
      : wedgeGeometry(solid.width, solid.length, solid.height);
    const position = new THREE.Vector3(...solid.center);
    worldGridUVs(geometry, position, solid.rotY);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials[solid.mat] ?? materials.concrete);
    mesh.position.copy(position);
    mesh.rotation.y = solid.rotY;
    mesh.castShadow = solid.mat !== 'ground';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const paint of expanded.paint) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(paint.size[0], paint.size[1]),
      new THREE.MeshStandardMaterial({ color: paint.color, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    mesh.position.set(...paint.center);
    mesh.rotation.set(-Math.PI / 2, paint.rotY, 0, 'YXZ');
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const sign of expanded.signs) {
    const map = signTexture(sign);
    const material = new THREE.MeshStandardMaterial({
      map,
      transparent: !!sign.plain,
      depthWrite: !sign.plain,
      roughness: 0.8,
      // A little self-lighting keeps signs readable in shadow.
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: sign.plain ? 0.15 : 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sign.size[0], sign.size[1]), material);
    mesh.position.set(...sign.at);
    if (sign.floor) {
      mesh.position.y += 0.012;
      mesh.rotation.set(-Math.PI / 2, sign.rotY, 0, 'YXZ');
    } else {
      mesh.rotation.y = sign.rotY;
    }
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
